import client from 'prom-client';
import { Request, Response, NextFunction } from 'express';

export const register = new client.Registry();

// Enable default runtime & nodejs telemetry
client.collectDefaultMetrics({
  register,
  prefix: 'cinepass_notification_',
});

// Standard RED metrics: Rate, Errors, Duration
export const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests processed by notification-service',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

export const httpRequestDurationSeconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request latency duration in seconds for notification-service',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register],
});

// SQS Worker & PDF Processing Telemetry
export const sqsMessagesConsumedTotal = new client.Counter({
  name: 'cinepass_sqs_messages_consumed_total',
  help: 'Total number of SQS ticket events consumed and processed',
  labelNames: ['status'], // 'success', 'failure'
  registers: [register],
});

export const pdfGenerationDurationSeconds = new client.Histogram({
  name: 'cinepass_pdf_generation_duration_seconds',
  help: 'Time taken to render dynamic QR code and compile boarding pass PDF',
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5],
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
