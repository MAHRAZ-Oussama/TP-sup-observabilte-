'use strict';

const express = require('express');
const client = require('prom-client');
const { trace } = require('@opentelemetry/api');

const app = express();
const PORT = 3002;
const SERVICE_NAME = process.env.SERVICE_NAME || 'service-users';

// Mock users data
const USERS = {
  '1': { id: '1', name: 'Alice Martin', email: 'alice.martin@example.com', role: 'premium', joinedAt: '2023-03-10' },
  '2': { id: '2', name: 'Bob Dupont', email: 'bob.dupont@example.com', role: 'standard', joinedAt: '2023-06-22' },
  '3': { id: '3', name: 'Clara Lefebvre', email: 'clara.lefebvre@example.com', role: 'premium', joinedAt: '2023-09-05' },
};

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

// GET /users/:id - returns a single user
app.get('/users/:id', (req, res) => {
  const user = USERS[req.params.id];
  if (!user) {
    return res.status(404).json({ error: 'User not found', id: req.params.id });
  }
  res.json(user);
});

app.listen(PORT, () => {
  console.log(`[${SERVICE_NAME}] Running on port ${PORT}`);
});
