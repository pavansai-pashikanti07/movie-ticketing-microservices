import PDFDocument from 'pdfkit';
import { QrService } from './qr.service';

export interface TicketPdfInput {
  bookingId: number;
  paymentId: string;
  movieTitle: string;
  theaterName: string;
  screenName: string;
  showDate: string;
  startTime: string;
  seats: string[];
  totalAmount: number;
  customerEmail: string;
}

export class PdfService {
  /**
   * Generates a high-quality movie ticket boarding pass PDF buffer with embedded QR code
   */
  public static async generateTicketPdf(data: TicketPdfInput): Promise<Buffer> {
    const qrBuffer = await QrService.generateTicketQr({
      bookingId: data.bookingId,
      movieTitle: data.movieTitle,
      seats: data.seats,
      showDate: data.showDate,
      startTime: data.startTime,
    });

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A5', layout: 'landscape', margin: 30 });
      const buffers: Buffer[] = [];

      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', (err) => reject(err));

      // 1. Header Banner
      doc
        .rect(0, 0, doc.page.width, 50)
        .fill('#0f172a');

      doc
        .fillColor('#f8fafc')
        .fontSize(18)
        .font('Helvetica-Bold')
        .text('🎟️ CINEPASS ENTERPRISE - DIGITAL BOARDING PASS', 30, 18);

      // 2. Movie Details Section
      doc
        .fillColor('#0f172a')
        .fontSize(20)
        .font('Helvetica-Bold')
        .text(data.movieTitle, 30, 75);

      doc
        .fillColor('#475569')
        .fontSize(12)
        .font('Helvetica')
        .text(`Theater: ${data.theaterName}`, 30, 105)
        .text(`Screen: ${data.screenName}`, 30, 122)
        .text(`Date & Time: ${data.showDate} | ${data.startTime}`, 30, 139)
        .text(`Seats: ${data.seats.join(', ')} (${data.seats.length} Tickets)`, 30, 156)
        .text(`Total Paid: INR ${data.totalAmount.toFixed(2)} [${data.paymentId}]`, 30, 173)
        .text(`Guest: ${data.customerEmail}`, 30, 190);

      // 3. Divider Line
      doc
        .moveTo(30, 220)
        .lineTo(doc.page.width - 30, 220)
        .strokeColor('#cbd5e1')
        .stroke();

      // 4. Booking Reference Footer
      doc
        .fillColor('#64748b')
        .fontSize(10)
        .text(`Booking Reference: CP-${data.bookingId}-${Date.now().toString(36).toUpperCase()}`, 30, 235)
        .text('Please scan this digital pass at the auditorium usher turnstile.', 30, 250);

      // 5. Dynamic Verification QR Code
      doc.image(qrBuffer, doc.page.width - 170, 75, { width: 140, height: 140 });

      doc.end();
    });
  }
}
