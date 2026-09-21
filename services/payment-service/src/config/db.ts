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
  ssl: process.env.DB_HOST && process.env.DB_HOST !== 'localhost' ? { rejectUnauthorized: false } : undefined,
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected error on idle client:', err);
});

export const initDb = async (): Promise<void> => {
  try {
    const client = await pool.connect();
    try {
      console.log('[DB] Connected to PostgreSQL. Verifying payment ledger schemas...');

      // 1. Payments Financial Ledger Table
      await client.query(`
        CREATE TABLE IF NOT EXISTS payments (
          id SERIAL PRIMARY KEY,
          payment_id VARCHAR(100) UNIQUE NOT NULL,
          idempotency_key VARCHAR(100) UNIQUE NOT NULL,
          booking_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
          amount NUMERIC(10, 2) NOT NULL,
          currency VARCHAR(10) NOT NULL DEFAULT 'INR',
          status VARCHAR(50) NOT NULL DEFAULT 'INITIATED',
          payment_method VARCHAR(50) NOT NULL DEFAULT 'UPI',
          gateway_transaction_id VARCHAR(100),
          metadata JSONB,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_payments_idempotency ON payments(idempotency_key);
        CREATE INDEX IF NOT EXISTS idx_payments_booking ON payments(booking_id);
        CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
      `);

      console.log('[DB] Payment ledger schema verified successfully.');
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('[DB] Payment DB initialization warning (will retry on connection):', error);
  }
};
