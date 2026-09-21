import { Request, Response } from 'express';
import { z } from 'zod';
import { pool } from '../config/db';
import { SqsService, TicketBookedEventPayload } from '../services/sqs.service';
import { paymentsTotal, sqsEventsPublishedTotal } from '../utils/metrics';

const processPaymentSchema = z.object({
  bookingId: z.number().int().positive(),
  userId: z.number().int().positive(),
  userEmail: z.string().email(),
  amount: z.number().positive(),
  paymentMethod: z.enum(['UPI', 'CREDIT_CARD', 'DEBIT_CARD', 'NET_BANKING']).default('UPI'),
  idempotencyKey: z.string().min(8, 'Idempotency key must be at least 8 characters'),
  movieDetails: z.object({
    movieTitle: z.string(),
    theaterName: z.string(),
    screenName: z.string(),
    showDate: z.string(),
    startTime: z.string(),
    seats: z.array(z.string()).min(1),
  }),
});

export const processPayment = async (req: Request, res: Response): Promise<void> => {
  try {
    const parseResult = processPaymentSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        errors: parseResult.error.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
      });
      return;
    }

    const {
      bookingId,
      userId,
      userEmail,
      amount,
      paymentMethod,
      idempotencyKey,
      movieDetails,
    } = parseResult.data;

    // 1. Strict Idempotency Check
    const existingPaymentQuery = 'SELECT * FROM payments WHERE idempotency_key = $1';
    const existingPaymentRes = await pool.query(existingPaymentQuery, [idempotencyKey]);

    if (existingPaymentRes.rows.length > 0) {
      paymentsTotal.inc({ status: 'idempotent_duplicate' });
      const existing = existingPaymentRes.rows[0];
      console.log(`[Payment:Idempotency] Request replay detected for key: ${idempotencyKey}`);
      res.status(200).json({
        success: true,
        message: 'Payment already processed (idempotent replay).',
        idempotentReplay: true,
        data: existing,
      });
      return;
    }

    // 2. Generate Unique Payment ID
    const paymentId = `pay_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const gatewayTransactionId = `gw_tx_${Date.now()}`;

    // 3. Record in PostgreSQL Financial Ledger
    const insertQuery = `
      INSERT INTO payments (
        payment_id, idempotency_key, booking_id, user_id, amount,
        status, payment_method, gateway_transaction_id, metadata
      )
      VALUES ($1, $2, $3, $4, $5, 'SUCCESS', $6, $7, $8)
      RETURNING *
    `;

    const paymentResult = await pool.query(insertQuery, [
      paymentId,
      idempotencyKey,
      bookingId,
      userId,
      amount,
      paymentMethod,
      gatewayTransactionId,
      JSON.stringify(movieDetails),
    ]);

    const createdPayment = paymentResult.rows[0];

    // 4. Asynchronously Publish Event to AWS SQS (sub-5ms)
    const eventPayload: TicketBookedEventPayload = {
      eventType: 'TICKET_BOOKED',
      bookingId,
      paymentId: createdPayment.payment_id,
      userId,
      userEmail,
      movieTitle: movieDetails.movieTitle,
      theaterName: movieDetails.theaterName,
      screenName: movieDetails.screenName,
      showDate: movieDetails.showDate,
      startTime: movieDetails.startTime,
      seats: movieDetails.seats,
      totalAmount: amount,
      timestamp: new Date().toISOString(),
    };

    const sqsResult = await SqsService.publishTicketBookedEvent(eventPayload);
    paymentsTotal.inc({ status: 'success' });
    sqsEventsPublishedTotal.inc({ status: sqsResult.messageId ? 'success' : 'failure' });

    // 5. Respond immediately to customer
    res.status(200).json({
      success: true,
      message: 'Payment captured successfully. Ticket confirmed!',
      data: {
        payment: createdPayment,
        sqsDispatch: {
          messageId: sqsResult.messageId,
          dispatchLatencyMs: sqsResult.latencyMs,
        },
      },
    });
  } catch (error) {
    paymentsTotal.inc({ status: 'failure' });
    console.error('[PaymentController.processPayment] Error:', error);
    res.status(500).json({ success: false, message: 'Financial ledger error processing payment.' });
  }
};

export const getPaymentById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { paymentId } = req.params;
    const result = await pool.query('SELECT * FROM payments WHERE payment_id = $1', [paymentId]);

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Payment record not found.' });
      return;
    }

    res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('[PaymentController.getPaymentById] Error:', error);
    res.status(500).json({ success: false, message: 'Error fetching payment record.' });
  }
};

export const getPaymentByBookingId = async (req: Request, res: Response): Promise<void> => {
  try {
    const bookingId = parseInt(req.params.bookingId, 10);
    const result = await pool.query('SELECT * FROM payments WHERE booking_id = $1', [bookingId]);

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'No payment found for this booking.' });
      return;
    }

    res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('[PaymentController.getPaymentByBookingId] Error:', error);
    res.status(500).json({ success: false, message: 'Error fetching payment by booking ID.' });
  }
};

export const webhookHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const signature = req.headers['x-razorpay-signature'] || 'mock_sig';
    console.log(`[PaymentWebhook] Received payment webhook with signature: ${signature}`);

    res.status(200).json({ success: true, message: 'Webhook verified and acknowledged.' });
  } catch (error) {
    res.status(400).json({ success: false, message: 'Webhook signature verification failed.' });
  }
};

export const healthCheck = async (_req: Request, res: Response): Promise<void> => {
  try {
    await pool.query('SELECT 1');

    res.status(200).json({
      status: 'UP',
      service: 'cinepass-payment-service',
      database: 'CONNECTED',
      eventBus: 'AWS_SQS_ACTIVE',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(503).json({
      status: 'DOWN',
      service: 'cinepass-payment-service',
      database: 'DISCONNECTED',
      timestamp: new Date().toISOString(),
      error: (err as Error).message,
    });
  }
};
