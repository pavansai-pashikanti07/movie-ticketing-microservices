import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { pool } from '../config/db';

const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  phone: z.string().optional(),
  role: z.enum(['CUSTOMER', 'THEATER_ADMIN', 'PLATFORM_SUPERADMIN']).optional().default('CUSTOMER'),
  theaterId: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

const generateToken = (payload: { id: number; email: string; role: string; theaterId?: string | null }) => {
  const secret = process.env.JWT_SECRET || 'super_secret_jwt_key_cinepass_production_2026';
  const expiresIn = process.env.JWT_EXPIRATION || '15m';
  return jwt.sign(payload, secret, { expiresIn: expiresIn as jwt.SignOptions['expiresIn'] });
};

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const parseResult = registerSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        errors: parseResult.error.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
      });
      return;
    }

    const { name, email, password, phone, role, theaterId } = parseResult.data;

    // Check if user already exists
    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existingUser.rows.length > 0) {
      res.status(409).json({
        success: false,
        message: 'A user with this email address already exists.',
      });
      return;
    }

    // Hash password with bcrypt
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Insert user
    const insertQuery = `
      INSERT INTO users (name, email, password_hash, role, phone, theater_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, name, email, role, phone, theater_id, created_at
    `;
    const result = await pool.query(insertQuery, [
      name,
      email.toLowerCase(),
      passwordHash,
      role,
      phone || null,
      theaterId || null,
    ]);

    const newUser = result.rows[0];
    const token = generateToken({
      id: newUser.id,
      email: newUser.email,
      role: newUser.role,
      theaterId: newUser.theater_id,
    });

    res.status(201).json({
      success: true,
      message: 'User registered successfully.',
      data: {
        user: {
          id: newUser.id,
          name: newUser.name,
          email: newUser.email,
          role: newUser.role,
          theaterId: newUser.theater_id,
          createdAt: newUser.created_at,
        },
        token,
      },
    });
  } catch (error) {
    console.error('[AuthController.register] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while creating user account.',
    });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const parseResult = loginSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        errors: parseResult.error.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
      });
      return;
    }

    const { email, password } = parseResult.data;

    // Fetch user
    const result = await pool.query(
      'SELECT id, name, email, password_hash, role, theater_id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      res.status(401).json({
        success: false,
        message: 'Invalid email or password credentials.',
      });
      return;
    }

    const user = result.rows[0];

    // Verify password with bcrypt
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      res.status(401).json({
        success: false,
        message: 'Invalid email or password credentials.',
      });
      return;
    }

    const token = generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
      theaterId: user.theater_id,
    });

    res.status(200).json({
      success: true,
      message: 'Login successful.',
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          theaterId: user.theater_id,
        },
        token,
      },
    });
  } catch (error) {
    console.error('[AuthController.login] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while logging in.',
    });
  }
};

export const getProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthenticated.' });
      return;
    }

    const result = await pool.query(
      'SELECT id, name, email, role, phone, theater_id, created_at FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'User profile not found.' });
      return;
    }

    const user = result.rows[0];
    res.status(200).json({
      success: true,
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        theaterId: user.theater_id,
        createdAt: user.created_at,
      },
    });
  } catch (error) {
    console.error('[AuthController.getProfile] Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error fetching profile.' });
  }
};

export const healthCheck = async (_req: Request, res: Response): Promise<void> => {
  try {
    // Check database responsiveness
    await pool.query('SELECT 1');
    res.status(200).json({
      status: 'UP',
      service: 'cinepass-auth-service',
      database: 'CONNECTED',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(503).json({
      status: 'DEGRADED',
      service: 'cinepass-auth-service',
      database: 'DISCONNECTED',
      timestamp: new Date().toISOString(),
      error: (err as Error).message,
    });
  }
};
