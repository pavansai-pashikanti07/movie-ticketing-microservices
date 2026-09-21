import express, { Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import dotenv from 'dotenv';
import catalogRoutes from './routes/catalog.routes';
import { initDb, pool } from './config/db';
import { connectRedis, redis } from './config/redis';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8081;

// Security and parser middlewares
app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.use(express.json());

// Global Kubernetes liveness/readiness probe
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'UP', service: 'catalog-service', timestamp: new Date().toISOString() });
});

// Mount Catalog Microservice routes
app.use('/api/catalog', catalogRoutes);

// 404 Handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ success: false, message: 'Resource endpoint not found.' });
});

// Start server, initialize PostgreSQL tables and connect Redis
const server = app.listen(PORT, async () => {
  console.log(`[CatalogService] Microservice running on port ${PORT}`);
  await connectRedis();
  await initDb();
});

// Graceful shutdown handling
const shutdown = async (signal: string) => {
  console.log(`[CatalogService] Received ${signal}. Gracefully shutting down...`);
  server.close(async () => {
    try {
      await redis.quit();
      await pool.end();
      console.log('[CatalogService] Database & Redis connections drained cleanly.');
      process.exit(0);
    } catch (err) {
      console.error('[CatalogService] Error during shutdown:', err);
      process.exit(1);
    }
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default app;
