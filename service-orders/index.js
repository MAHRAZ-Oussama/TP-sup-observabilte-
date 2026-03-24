'use strict';

const express = require('express');
const axios = require('axios');
const client = require('prom-client');
const { trace } = require('@opentelemetry/api');

const app = express();
const PORT = 3001;
const USERS_SERVICE_URL = process.env.USERS_SERVICE_URL || 'http://localhost:3002';
const SERVICE_NAME = process.env.SERVICE_NAME || 'service-orders';

// Mock orders data
const ORDERS = [
  { id: '1', userId: '1', product: 'Laptop Pro 15"', amount: 1299.99, status: 'delivered', createdAt: '2024-01-15' },
  { id: '2', userId: '2', product: 'Wireless Headphones', amount: 149.99, status: 'shipped', createdAt: '2024-01-16' },
  { id: '3', userId: '1', product: 'USB-C Hub', amount: 59.99, status: 'processing', createdAt: '2024-01-17' },
  { id: '4', userId: '3', product: 'Mechanical Keyboard', amount: 189.99, status: 'delivered', createdAt: '2024-01-18' },
  { id: '5', userId: '2', product: 'Monitor 27"', amount: 449.99, status: 'shipped', createdAt: '2024-01-19' },
];

// Prometheus metrics
const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [register],
});

const httpErrorsTotal = new client.Counter({
  name: 'http_errors_total',
  help: 'Total number of HTTP errors',
  labelNames: ['method', 'route'],
  registers: [register],
});

// Metrics middleware
app.use((req, res, next) => {
  const start = Date.now();
  const route = req.path;
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    httpRequestsTotal.inc({ method: req.method, route, status_code: res.statusCode });
    httpRequestDuration.observe({ method: req.method, route }, duration);
    if (res.statusCode >= 400) {
      httpErrorsTotal.inc({ method: req.method, route });
    }
    const activeSpan = trace.getActiveSpan();
    const traceId = activeSpan ? activeSpan.spanContext().traceId : 'no-trace';
    console.log(`[${SERVICE_NAME}] ${req.method} ${route} ${res.statusCode} ${duration.toFixed(3)}s trace_id=${traceId}`);
  });
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: SERVICE_NAME });
});

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// GET /orders/slow - simulates artificial latency (incident scenario)
app.get('/orders/slow', async (req, res) => {
  const delay = 3000 + Math.random() * 2000; // 3-5 seconds
  await new Promise(resolve => setTimeout(resolve, delay));
  res.json({
    message: 'Slow response simulated',
    delay: `${delay.toFixed(0)}ms`,
    orders: ORDERS.slice(0, 2),
  });
});

// GET /orders/error - simulates HTTP 500 error (incident scenario)
app.get('/orders/error', (req, res) => {
  res.status(500).json({
    error: 'Internal Server Error',
    message: 'Simulated error: database connection failed',
    service: SERVICE_NAME,
  });
});

// GET /orders - returns all orders enriched with user info
app.get('/orders', async (req, res) => {
  try {
    const enrichedOrders = await Promise.all(
      ORDERS.map(async (order) => {
        try {
          const userResponse = await axios.get(`${USERS_SERVICE_URL}/users/${order.userId}`);
          return { ...order, user: userResponse.data };
        } catch (err) {
          return { ...order, user: null, userError: err.message };
        }
      })
    );
    res.json({ orders: enrichedOrders, total: enrichedOrders.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /orders/:id - returns a single order
app.get('/orders/:id', async (req, res) => {
  const order = ORDERS.find(o => o.id === req.params.id);
  if (!order) {
    return res.status(404).json({ error: 'Order not found', id: req.params.id });
  }
  try {
    const userResponse = await axios.get(`${USERS_SERVICE_URL}/users/${order.userId}`);
    res.json({ ...order, user: userResponse.data });
  } catch (err) {
    res.json({ ...order, user: null, userError: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`[${SERVICE_NAME}] Running on port ${PORT}`);
});
