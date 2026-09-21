import client from 'prom-client';
import { Request, Response, NextFunction } from 'express';

export const register = new client.Registry();

// Enable default runtime & nodejs telemetry
client.collectDefaultMetrics({
  register,
  prefix: 'cinepass_payment_',
});

// Standard RED metrics: Rate, Errors, Duration
export const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests processed by payment-service',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

export const httpRequestDurationSeconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request latency duration in seconds for payment-service',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register],
});

// Financial Transaction Telemetry
export const paymentsTotal = new client.Counter({
  name: 'cinepass_payments_total',
  help: 'Total count of processed payments classified by transaction status',
  labelNames: ['status'], // 'success', 'failure', 'idempotent_duplicate'
  registers: [register],
});

export const sqsEventsPublishedTotal = new client.Counter({
  name: 'cinepass_payment_sqs_events_published_total',
  help: 'Total count of TICKET_BOOKED events dispatched to AWS SQS',
  labelNames: ['status'], // 'success', 'failure'
  registers: [register],
});

// Express metrics recording middleware
export const metricsMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (req.path === '/metrics' || req.path === '/health') {
    return next();
  }

  const start = process.hrtime();

  res.on('finish', () => {
    const diff = process.hrtime(start);
    const durationInSeconds = diff[0] + diff[1] / 1e9;
    const route = req.baseUrl || req.path || 'unknown';
    const statusCode = res.statusCode.toString();

    httpRequestsTotal.inc({
      method: req.method,
      route,
      status_code: statusCode,
    });

    httpRequestDurationSeconds.observe(
      {
        method: req.method,
        route,
        status_code: statusCode,
      },
      durationInSeconds
    );
  });

  next();
};
