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
      console.log('[DB] Connected to PostgreSQL. Verifying booking schemas...');

      // 1. Bookings Master Table
      await client.query(`
        CREATE TABLE IF NOT EXISTS bookings (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL,
          show_id INTEGER NOT NULL,
          total_amount NUMERIC(10, 2) NOT NULL,
          status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
          seats TEXT[] NOT NULL,
          expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(user_id);
        CREATE INDEX IF NOT EXISTS idx_bookings_show ON bookings(show_id);
        CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
      `);

      // 2. Booked Seats Table with Database-Level Strict Idempotency & Unique Constraint
      await client.query(`
        CREATE TABLE IF NOT EXISTS booked_seats (
          id SERIAL PRIMARY KEY,
          show_id INTEGER NOT NULL,
          seat_number VARCHAR(20) NOT NULL,
          booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT uq_show_seat UNIQUE (show_id, seat_number)
        );

        CREATE INDEX IF NOT EXISTS idx_booked_seats_lookup ON booked_seats(show_id);
      `);

      console.log('[DB] Booking schemas verified successfully.');
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('[DB] Booking DB initialization warning (will retry on connection):', error);
  }
};
