import { Router } from 'express';
import {
  testGenerateTicket,
  getNotificationHistory,
  healthCheck,
} from '../controllers/notification.controller';

const router = Router();

// Notification Endpoints
router.post('/test-generate', testGenerateTicket);
router.get('/history/:bookingId', getNotificationHistory);
router.get('/health', healthCheck);

export default router;
