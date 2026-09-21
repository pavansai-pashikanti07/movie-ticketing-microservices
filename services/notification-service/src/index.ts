import express, { Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import dotenv from 'dotenv';
import notificationRoutes from './routes/notification.routes';
import { initDb, pool } from './config/db';
import { SqsConsumerService } from './services/sqs-consumer.service';
import { metricsMiddleware, register } from './utils/metrics';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8084;

// Security and parser middlewares
app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.use(express.json());

// Prometheus Metrics Instrumentation
app.use(metricsMiddleware);

// Global Kubernetes liveness/readiness probe
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'UP', service: 'notification-service', timestamp: new Date().toISOString() });
});

// Prometheus Scrape Endpoint
app.get('/metrics', async (_req: Request, res: Response) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    res.status(500).end(err);
  }
});

// Mount Notification Microservice routes
app.use('/api/notifications', notificationRoutes);

// 404 Handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ success: false, message: 'Resource endpoint not found.' });
});

// Start server, initialize PostgreSQL tables and start SQS long-polling consumer
const server = app.listen(PORT, async () => {
  console.log(`[NotificationService] Worker running on port ${PORT}`);
  await initDb();
  SqsConsumerService.startConsumer();
});

// Graceful shutdown handling
const shutdown = async (signal: string) => {
  console.log(`[NotificationService] Received ${signal}. Gracefully shutting down...`);
  SqsConsumerService.stopConsumer();
  server.close(async () => {
    try {
      await pool.end();
      console.log('[NotificationService] PostgreSQL pool drained cleanly.');
      process.exit(0);
    } catch (err) {
      console.error('[NotificationService] Error during shutdown:', err);
      process.exit(1);
    }
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default app;
