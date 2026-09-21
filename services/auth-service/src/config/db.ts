import { Pool } from 'pg';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

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
      console.log('[DB] Connected to PostgreSQL. Verifying schemas...');
      
      // Create users table supporting multi-tenant RBAC
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          role VARCHAR(50) NOT NULL DEFAULT 'CUSTOMER',
          phone VARCHAR(20),
          theater_id VARCHAR(100), -- populated if role is THEATER_ADMIN
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
        CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
      `);

      // Seed SuperAdmin if not exists
      const superAdminEmail = 'admin@cinepass.com';
      const existingSuperAdmin = await client.query('SELECT id FROM users WHERE email = $1', [superAdminEmail]);
      if (existingSuperAdmin.rows.length === 0) {
        const hashedPassword = await bcrypt.hash('Admin@12345', 10);
        await client.query(`
          INSERT INTO users (name, email, password_hash, role)
          VALUES ($1, $2, $3, $4)
        `, ['CinePass Super Admin', superAdminEmail, hashedPassword, 'PLATFORM_SUPERADMIN']);
        console.log('[DB] Seeded default PLATFORM_SUPERADMIN (admin@cinepass.com)');
      }

      // Seed Theater Admin for AMB Cinemas
      const theaterAdminEmail = 'manager@ambcinemas.com';
      const existingTheaterAdmin = await client.query('SELECT id FROM users WHERE email = $1', [theaterAdminEmail]);
      if (existingTheaterAdmin.rows.length === 0) {
        const hashedPassword = await bcrypt.hash('Manager@12345', 10);
        await client.query(`
          INSERT INTO users (name, email, password_hash, role, theater_id)
          VALUES ($1, $2, $3, $4, $5)
        `, ['AMB Cinemas Manager', theaterAdminEmail, hashedPassword, 'THEATER_ADMIN', 'amb-gachibowli']);
        console.log('[DB] Seeded default THEATER_ADMIN (manager@ambcinemas.com / amb-gachibowli)');
      }

      console.log('[DB] User authentication schema verified successfully.');
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('[DB] Database initialization warning (will retry on next request):', error);
  }
};
