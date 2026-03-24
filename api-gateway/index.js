'use strict';

const express = require('express');
const axios = require('axios');
const client = require('prom-client');
const { trace, context } = require('@opentelemetry/api');

const app = express();
const PORT = 3000;
const ORDERS_SERVICE_URL = process.env.ORDERS_SERVICE_URL || 'http://localhost:3001';
const SERVICE_NAME = process.env.SERVICE_NAME || 'api-gateway';

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
    // Log with trace_id for correlation
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

// GET /orders - proxy to service-orders
app.get('/orders', async (req, res) => {
  try {
    const response = await axios.get(`${ORDERS_SERVICE_URL}/orders`);
    res.json(response.data);
  } catch (err) {
    const status = err.response ? err.response.status : 500;
    const data = err.response ? err.response.data : { error: err.message };
    res.status(status).json(data);
  }
});

// GET /orders/slow - proxy slow endpoint
app.get('/orders/slow', async (req, res) => {
  try {
    const response = await axios.get(`${ORDERS_SERVICE_URL}/orders/slow`, { timeout: 10000 });
    res.json(response.data);
  } catch (err) {
    const status = err.response ? err.response.status : 500;
    const data = err.response ? err.response.data : { error: err.message };
    res.status(status).json(data);
  }
});

// GET /orders/error - proxy error endpoint
app.get('/orders/error', async (req, res) => {
  try {
    const response = await axios.get(`${ORDERS_SERVICE_URL}/orders/error`);
    res.json(response.data);
  } catch (err) {
    const status = err.response ? err.response.status : 500;
    const data = err.response ? err.response.data : { error: err.message };
    res.status(status).json(data);
  }
});

// GET /orders/:id - proxy to service-orders
app.get('/orders/:id', async (req, res) => {
  try {
    const response = await axios.get(`${ORDERS_SERVICE_URL}/orders/${req.params.id}`);
    res.json(response.data);
  } catch (err) {
    const status = err.response ? err.response.status : 500;
    const data = err.response ? err.response.data : { error: err.message };
    res.status(status).json(data);
  }
});

app.listen(PORT, () => {
  console.log(`[${SERVICE_NAME}] Running on port ${PORT}`);
});
