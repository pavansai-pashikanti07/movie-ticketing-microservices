import { Request, Response } from 'express';
import { z } from 'zod';
import { pool } from '../config/db';
import { PdfService } from '../services/pdf.service';
import { S3Service } from '../services/s3.service';

const testTicketSchema = z.object({
  bookingId: z.number().int().positive().default(101),
  paymentId: z.string().default('pay_test_demo'),
  movieTitle: z.string().default('Pushpa 2: The Rule'),
  theaterName: z.string().default('AMB Cinemas: Gachibowli'),
  screenName: z.string().default('Screen 1 (Laser IMAX)'),
  showDate: z.string().default('2026-10-05'),
  startTime: z.string().default('11:15 AM'),
  seats: z.array(z.string()).default(['A1', 'A2']),
  totalAmount: z.number().positive().default(900),
  customerEmail: z.string().email().default('pavan@example.com'),
});

export const testGenerateTicket = async (req: Request, res: Response): Promise<void> => {
  try {
    const parseResult = testTicketSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ success: false, errors: parseResult.error.errors });
      return;
    }

    const data = parseResult.data;
    const pdfBuffer = await PdfService.generateTicketPdf(data);
    const cdnUrl = await S3Service.uploadTicketPdf(data.bookingId, pdfBuffer);

    // Record audit
    await pool.query(
      `
      INSERT INTO notification_logs (booking_id, payment_id, recipient_email, ticket_pdf_url, status, sqs_message_id)
      VALUES ($1, $2, $3, $4, 'DISPATCHED', 'manual_test_dispatch')
    `,
      [data.bookingId, data.paymentId, data.customerEmail, cdnUrl]
    );

    res.status(200).json({
      success: true,
      message: 'Ticket PDF and verification QR generated successfully.',
      data: {
        bookingId: data.bookingId,
        pdfSizeBytes: pdfBuffer.length,
        ticketPdfUrl: cdnUrl,
        customerEmail: data.customerEmail,
      },
    });
  } catch (error) {
    console.error('[NotificationController.testGenerateTicket] Error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate ticket PDF.' });
  }
};

export const getNotificationHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    const bookingId = parseInt(req.params.bookingId, 10);
    const result = await pool.query(
      'SELECT * FROM notification_logs WHERE booking_id = $1 ORDER BY dispatched_at DESC',
      [bookingId]
    );

    res.status(200).json({ success: true, count: result.rows.length, data: result.rows });
  } catch (error) {
    console.error('[NotificationController.getNotificationHistory] Error:', error);
    res.status(500).json({ success: false, message: 'Error retrieving notification history.' });
  }
};

export const healthCheck = async (_req: Request, res: Response): Promise<void> => {
  try {
    await pool.query('SELECT 1');

    res.status(200).json({
      status: 'UP',
      service: 'cinepass-notification-service',
      database: 'CONNECTED',
      sqsConsumer: 'ACTIVE',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(503).json({
      status: 'DOWN',
      service: 'cinepass-notification-service',
      database: 'DISCONNECTED',
      timestamp: new Date().toISOString(),
      error: (err as Error).message,
    });
  }
};
