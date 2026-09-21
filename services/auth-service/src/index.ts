import express, { Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.routes';
import { initDb, pool } from './config/db';
import { metricsMiddleware, register } from './utils/metrics';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

// Security and utility middlewares
app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.use(express.json());

// Prometheus Metrics Instrumentation
app.use(metricsMiddleware);

// Global Kubernetes liveness/readiness probe
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'UP', service: 'auth-service', timestamp: new Date().toISOString() });
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

// Mount Authentication Microservice routes
app.use('/api/auth', authRoutes);

// 404 Handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ success: false, message: 'Resource endpoint not found.' });
});

// Start server and initialize database tables
const server = app.listen(PORT, async () => {
  console.log(`[AuthService] Microservice running on port ${PORT}`);
  await initDb();
});

// Graceful shutdown handling
const shutdown = async (signal: string) => {
  console.log(`[AuthService] Received ${signal}. Gracefully shutting down...`);
  server.close(async () => {
    try {
      await pool.end();
      console.log('[AuthService] PostgreSQL connection pool drained.');
      process.exit(0);
    } catch (err) {
      console.error('[AuthService] Error draining pool:', err);
      process.exit(1);
    }
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default app;
