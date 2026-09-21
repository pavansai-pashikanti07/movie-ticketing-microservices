import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  Message,
} from '@aws-sdk/client-sqs';
import dotenv from 'dotenv';
import { PdfService, TicketPdfInput } from './pdf.service';
import { S3Service } from './s3.service';
import { pool } from '../config/db';
import { sqsMessagesConsumedTotal, pdfGenerationDurationSeconds } from '../utils/metrics';

dotenv.config();

const AWS_REGION = process.env.AWS_REGION || 'ap-south-2';
const SQS_QUEUE_URL = process.env.SQS_QUEUE_URL || '';
const WAIT_TIME_SECONDS = parseInt(process.env.SQS_WAIT_TIME_SECONDS || '10', 10);
const MAX_MESSAGES = parseInt(process.env.SQS_MAX_MESSAGES || '5', 10);

export const sqsClient = new SQSClient({
  region: AWS_REGION,
});

export class SqsConsumerService {
  private static isRunning = false;

  public static startConsumer(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log(`[SQSConsumer] Starting event loop on queue: ${SQS_QUEUE_URL || 'LocalMockQueue'}`);

    if (SQS_QUEUE_URL) {
      this.pollQueue();
    } else {
      console.log('[SQSConsumer] SQS_QUEUE_URL not configured. Running in worker stand-by mode.');
    }
  }

  public static stopConsumer(): void {
    this.isRunning = false;
    console.log('[SQSConsumer] Stopped event loop.');
  }

  private static async pollQueue(): Promise<void> {
    while (this.isRunning) {
      try {
        const command = new ReceiveMessageCommand({
          QueueUrl: SQS_QUEUE_URL,
          MaxNumberOfMessages: MAX_MESSAGES,
          WaitTimeSeconds: WAIT_TIME_SECONDS,
          VisibilityTimeout: 30,
        });

        const response = await sqsClient.send(command);

        if (response.Messages && response.Messages.length > 0) {
          console.log(`[SQSConsumer] Received ${response.Messages.length} booking event message(s).`);
          for (const message of response.Messages) {
            await this.processMessage(message);
          }
        }
      } catch (err) {
        // Log non-fatal error and pause briefly before next poll
        // console.warn('[SQSConsumer] Poll cycle notice:', (err as Error).message);
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  }

  public static async processMessage(message: Message): Promise<void> {
    try {
      if (!message.Body) return;

      const event = JSON.parse(message.Body);
      console.log(`[SQSConsumer] Processing TicketBooked event for BookingId: ${event.bookingId}`);

      // 1. Programmatically Generate Boarding Pass PDF with Dynamic QR Code
      const pdfInput: TicketPdfInput = {
        bookingId: event.bookingId,
        paymentId: event.paymentId,
        movieTitle: event.movieTitle,
        theaterName: event.theaterName,
        screenName: event.screenName,
        showDate: event.showDate,
        startTime: event.startTime,
        seats: event.seats,
        totalAmount: event.totalAmount,
        customerEmail: event.userEmail,
      };

      const pdfStart = process.hrtime();
      const pdfBuffer = await PdfService.generateTicketPdf(pdfInput);
      const pdfDiff = process.hrtime(pdfStart);
      pdfGenerationDurationSeconds.observe(pdfDiff[0] + pdfDiff[1] / 1e9);

      // 2. Upload PDF to Amazon S3 Bucket
      const ticketPdfUrl = await S3Service.uploadTicketPdf(event.bookingId, pdfBuffer);

      // 3. Dispatch Email & Notification Simulation
      console.log(`[Notifier] Dispatched Ticket Confirmation Email to ${event.userEmail}`);
      console.log(`[Notifier] Ticket PDF Download Link: ${ticketPdfUrl}`);

      // 4. Record Audit Entry in PostgreSQL
      await pool.query(
        `
        INSERT INTO notification_logs (booking_id, payment_id, recipient_email, ticket_pdf_url, status, sqs_message_id)
        VALUES ($1, $2, $3, $4, 'DISPATCHED', $5)
      `,
        [event.bookingId, event.paymentId, event.userEmail, ticketPdfUrl, message.MessageId || 'local_msg']
      );

      // 5. Delete Message from SQS upon successful processing (Acknowledge)
      if (SQS_QUEUE_URL && message.ReceiptHandle) {
        await sqsClient.send(
          new DeleteMessageCommand({
            QueueUrl: SQS_QUEUE_URL,
            ReceiptHandle: message.ReceiptHandle,
          })
        );
        console.log(`[SQSConsumer] Acknowledged and deleted message: ${message.MessageId}`);
      }

      sqsMessagesConsumedTotal.inc({ status: 'success' });
    } catch (error) {
      sqsMessagesConsumedTotal.inc({ status: 'failure' });
      console.error('[SQSConsumer] Error processing message (message will be retried or moved to DLQ):', error);
    }
  }
}
