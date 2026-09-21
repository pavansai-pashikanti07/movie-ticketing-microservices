import { Router } from 'express';
import {
  holdSeats,
  getShowSeatMap,
  confirmBooking,
  releaseBooking,
  getBookingById,
  healthCheck,
} from '../controllers/booking.controller';

const router = Router();

// Seat Locking & Concurrency Endpoints
router.post('/hold', holdSeats);
router.get('/show/:showId/seats', getShowSeatMap);
router.post('/:bookingId/confirm', confirmBooking);
router.post('/:bookingId/release', releaseBooking);
router.get('/:id', getBookingById);
router.get('/health', healthCheck);

export default router;
