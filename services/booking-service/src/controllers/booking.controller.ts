import { Request, Response } from 'express';
import { z } from 'zod';
import { pool } from '../config/db';
import { SeatLockService } from '../services/seat-lock.service';
import { checkRedisHealth } from '../config/redis';
import { bookingAttemptsTotal, seatCollisionsTotal } from '../utils/metrics';

const holdSeatsSchema = z.object({
  showId: z.number().int().positive(),
  seats: z.array(z.string().min(1)).min(1, 'At least one seat must be selected'),
  userId: z.number().int().positive(),
  totalAmount: z.number().positive(),
});

export const holdSeats = async (req: Request, res: Response): Promise<void> => {
  try {
    const parseResult = holdSeatsSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        errors: parseResult.error.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
      });
      return;
    }

    const { showId, seats, userId, totalAmount } = parseResult.data;
    const normalizedSeats = seats.map((s) => s.toUpperCase());

    // 1. Check if any seat is already permanently BOOKED in PostgreSQL
    const bookedQuery = `
      SELECT seat_number FROM booked_seats 
      WHERE show_id = $1 AND seat_number = ANY($2)
    `;
    const bookedResult = await pool.query(bookedQuery, [showId, normalizedSeats]);
    if (bookedResult.rows.length > 0) {
      bookingAttemptsTotal.inc({ status: 'collision' });
      seatCollisionsTotal.inc();
      const alreadyBooked = bookedResult.rows.map((r) => r.seat_number);
      res.status(409).json({
        success: false,
        message: `Seat(s) [${alreadyBooked.join(', ')}] have already been purchased and confirmed.`,
        conflictSeats: alreadyBooked,
      });
      return;
    }

    // 2. Atomically acquire 5-minute Redis locks
    const ttlSeconds = parseInt(process.env.SEAT_LOCK_TTL_SECONDS || '300', 10);
    const lockResult = await SeatLockService.acquireSeatLocks(showId, normalizedSeats, userId, ttlSeconds);

    if (!lockResult.success) {
      bookingAttemptsTotal.inc({ status: 'collision' });
      seatCollisionsTotal.inc();
      res.status(409).json({
        success: false,
        message: `Seat '${lockResult.conflictingSeat}' is currently held by another customer. Please select another seat.`,
        conflictSeats: [lockResult.conflictingSeat],
      });
      return;
    }

    bookingAttemptsTotal.inc({ status: 'success' });

    // 3. Create PENDING booking in PostgreSQL with expiration timestamp
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    const bookingQuery = `
      INSERT INTO bookings (user_id, show_id, total_amount, status, seats, expires_at)
      VALUES ($1, $2, $3, 'PENDING', $4, $5)
      RETURNING *
    `;
    const bookingResult = await pool.query(bookingQuery, [
      userId,
      showId,
      totalAmount,
      normalizedSeats,
      expiresAt,
    ]);

    const newBooking = bookingResult.rows[0];

    res.status(201).json({
      success: true,
      message: 'Seats held successfully for 5 minutes.',
      data: {
        bookingId: newBooking.id,
        showId: newBooking.show_id,
        seats: newBooking.seats,
        totalAmount: newBooking.total_amount,
        status: 'HELD',
        expiresAt: newBooking.expires_at,
        countdownSeconds: ttlSeconds,
      },
    });
  } catch (error) {
    console.error('[BookingController.holdSeats] Error:', error);
    res.status(500).json({ success: false, message: 'Internal error reserving seats.' });
  }
};

export const getShowSeatMap = async (req: Request, res: Response): Promise<void> => {
  try {
    const showId = parseInt(req.params.showId, 10);
    if (isNaN(showId)) {
      res.status(400).json({ success: false, message: 'Invalid show ID.' });
      return;
    }

    // 1. Permanently confirmed seats from PostgreSQL
    const bookedQuery = 'SELECT seat_number FROM booked_seats WHERE show_id = $1';
    const bookedResult = await pool.query(bookedQuery, [showId]);
    const bookedSeats = bookedResult.rows.map((r) => r.seat_number);

    // 2. Currently held seats in Redis
    const heldSeats = await SeatLockService.getHeldSeats(showId);

    // Remove any overlap just in case
    const filteredHeld = heldSeats.filter((s) => !bookedSeats.includes(s));

    res.status(200).json({
      success: true,
      showId,
      bookedSeats,
      heldSeats: filteredHeld,
      totalUnavailable: bookedSeats.length + filteredHeld.length,
    });
  } catch (error) {
    console.error('[BookingController.getShowSeatMap] Error:', error);
    res.status(500).json({ success: false, message: 'Error retrieving live seat map.' });
  }
};

export const confirmBooking = async (req: Request, res: Response): Promise<void> => {
  const client = await pool.connect();
  try {
    const bookingId = parseInt(req.params.bookingId, 10);
    if (isNaN(bookingId)) {
      res.status(400).json({ success: false, message: 'Invalid booking ID.' });
      return;
    }

    await client.query('BEGIN');

    // Fetch booking
    const bookingRes = await client.query('SELECT * FROM bookings WHERE id = $1 FOR UPDATE', [bookingId]);
    if (bookingRes.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, message: 'Booking not found.' });
      return;
    }

    const booking = bookingRes.rows[0];

    if (booking.status === 'CONFIRMED') {
      await client.query('COMMIT');
      res.status(200).json({ success: true, message: 'Booking already confirmed.', data: booking });
      return;
    }

    if (new Date() > new Date(booking.expires_at)) {
      await client.query('UPDATE bookings SET status = $1, updated_at = NOW() WHERE id = $2', [
        'EXPIRED',
        bookingId,
      ]);
      await client.query('COMMIT');
      res.status(410).json({
        success: false,
        message: 'Seat hold has expired. Please select seats again.',
      });
      return;
    }

    // Insert into booked_seats table (strictly enforced unique constraint)
    for (const seat of booking.seats) {
      await client.query(
        'INSERT INTO booked_seats (show_id, seat_number, booking_id) VALUES ($1, $2, $3)',
        [booking.show_id, seat, booking.id]
      );
    }

    // Update booking status
    const updateRes = await client.query(
      'UPDATE bookings SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      ['CONFIRMED', booking.id]
    );

    await client.query('COMMIT');

    // Clean up temporary Redis seat locks (seats are now permanently in PostgreSQL)
    await SeatLockService.releaseSeatLocks(booking.show_id, booking.seats);

    res.status(200).json({
      success: true,
      message: 'Booking confirmed successfully.',
      data: updateRes.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[BookingController.confirmBooking] Error:', error);
    res.status(500).json({ success: false, message: 'Failed to confirm booking.' });
  } finally {
    client.release();
  }
};

export const releaseBooking = async (req: Request, res: Response): Promise<void> => {
  try {
    const bookingId = parseInt(req.params.bookingId, 10);
    if (isNaN(bookingId)) {
      res.status(400).json({ success: false, message: 'Invalid booking ID.' });
      return;
    }

    const bookingRes = await pool.query('SELECT * FROM bookings WHERE id = $1', [bookingId]);
    if (bookingRes.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Booking not found.' });
      return;
    }

    const booking = bookingRes.rows[0];
    if (booking.status === 'PENDING') {
      await pool.query('UPDATE bookings SET status = $1, updated_at = NOW() WHERE id = $2', [
        'CANCELLED',
        bookingId,
      ]);
      await SeatLockService.releaseSeatLocks(booking.show_id, booking.seats);
    }

    res.status(200).json({ success: true, message: 'Seat hold released successfully.' });
  } catch (error) {
    console.error('[BookingController.releaseBooking] Error:', error);
    res.status(500).json({ success: false, message: 'Error releasing seats.' });
  }
};

export const getBookingById = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ success: false, message: 'Invalid booking ID format.' });
      return;
    }

    const result = await pool.query('SELECT * FROM bookings WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Booking not found.' });
      return;
    }

    res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('[BookingController.getBookingById] Error:', error);
    res.status(500).json({ success: false, message: 'Error retrieving booking.' });
  }
};

export const healthCheck = async (_req: Request, res: Response): Promise<void> => {
  try {
    await pool.query('SELECT 1');
    const redisHealthy = checkRedisHealth();

    res.status(200).json({
      status: 'UP',
      service: 'cinepass-booking-service',
      database: 'CONNECTED',
      seatLockEngine: redisHealthy ? 'REDIS_DISTRIBUTED' : 'LOCAL_FALLBACK',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(503).json({
      status: 'DOWN',
      service: 'cinepass-booking-service',
      database: 'DISCONNECTED',
      timestamp: new Date().toISOString(),
      error: (err as Error).message,
    });
  }
};
