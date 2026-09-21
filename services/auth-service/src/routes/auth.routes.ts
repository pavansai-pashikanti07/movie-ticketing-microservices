import { Router } from 'express';
import { register, login, getProfile, healthCheck } from '../controllers/auth.controller';
import { authenticateToken, requireRole } from '../middleware/auth.middleware';

const router = Router();

// Public Routes
router.post('/register', register);
router.post('/login', login);
router.get('/health', healthCheck);

// Protected Customer/User Routes
router.get('/me', authenticateToken, getProfile);

// Demonstration RBAC Protected Route for Theater Admins & Super Admins
router.get(
  '/admin/verify-access',
  authenticateToken,
  requireRole(['THEATER_ADMIN', 'PLATFORM_SUPERADMIN']),
  (req, res) => {
    res.status(200).json({
      success: true,
      message: `Access granted to admin portal. Authenticated as ${req.user?.role}.`,
      user: req.user,
    });
  }
);

export default router;
