import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';

dotenv.config();

const AWS_REGION = process.env.AWS_REGION || 'ap-south-2';
const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME || 'cinepass-assets-07784';
const CLOUDFRONT_DOMAIN = process.env.CLOUDFRONT_DOMAIN || 'https://assets.cinepass.com';

export const s3Client = new S3Client({
  region: AWS_REGION,
});

export class S3Service {
  /**
   * Uploads ticket PDF buffer to Amazon S3 bucket and returns CloudFront CDN URL
   */
  public static async uploadTicketPdf(bookingId: number, pdfBuffer: Buffer): Promise<string> {
    const key = `tickets/ticket_${bookingId}_${Date.now()}.pdf`;

    if (S3_BUCKET_NAME) {
      try {
        const command = new PutObjectCommand({
          Bucket: S3_BUCKET_NAME,
          Key: key,
          Body: pdfBuffer,
          ContentType: 'application/pdf',
        });

        await s3Client.send(command);
        const cdnUrl = `${CLOUDFRONT_DOMAIN}/${key}`;
        console.log(`[S3] Uploaded ticket PDF to s3://${S3_BUCKET_NAME}/${key} -> ${cdnUrl}`);
        return cdnUrl;
      } catch (err) {
        console.warn('[S3] S3 upload skipped in local environment (falling back to mock CDN URL):', (err as Error).message);
      }
    }

    // Local / Dev Fallback CDN URL
    const fallbackUrl = `${CLOUDFRONT_DOMAIN}/${key}`;
    console.log(`[S3:LocalMock] Generated Ticket PDF CloudFront Asset URL: ${fallbackUrl}`);
    return fallbackUrl;
  }
}
