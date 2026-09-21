import { Router } from 'express';
import {
  processPayment,
  getPaymentById,
  getPaymentByBookingId,
  webhookHandler,
  healthCheck,
} from '../controllers/payment.controller';

const router = Router();

// Payment Processing & Ledger Endpoints
router.post('/process', processPayment);
router.get('/:paymentId', getPaymentById);
router.get('/booking/:bookingId', getPaymentByBookingId);
router.post('/webhook', webhookHandler);
router.get('/health', healthCheck);

export default router;
