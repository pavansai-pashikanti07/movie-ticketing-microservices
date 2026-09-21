import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

export const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'cinepass_admin',
  password: process.env.DB_PASSWORD || 'PavanPassword123!',
  database: process.env.DB_NAME || 'cinepass',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected error on idle client:', err);
});

export const initDb = async (): Promise<void> => {
  try {
    const client = await pool.connect();
    try {
      console.log('[DB] Connected to PostgreSQL. Verifying notification audit schemas...');

      // 1. Notification Dispatch Audit Table
      await client.query(`
        CREATE TABLE IF NOT EXISTS notification_logs (
          id SERIAL PRIMARY KEY,
          booking_id INTEGER NOT NULL,
          payment_id VARCHAR(100),
          recipient_email VARCHAR(255) NOT NULL,
          ticket_pdf_url TEXT NOT NULL,
          status VARCHAR(50) NOT NULL DEFAULT 'DISPATCHED',
          sqs_message_id VARCHAR(100),
          dispatched_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_notif_booking ON notification_logs(booking_id);
        CREATE INDEX IF NOT EXISTS idx_notif_email ON notification_logs(recipient_email);
      `);

      console.log('[DB] Notification audit schema verified successfully.');
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('[DB] Notification DB initialization warning (will retry on connection):', error);
  }
};
