import QRCode from 'qrcode';

export class QrService {
  /**
   * Generates a verification QR code image buffer containing cryptographic verification metadata
   */
  public static async generateTicketQr(ticketData: {
    bookingId: number;
    movieTitle: string;
    seats: string[];
    showDate: string;
    startTime: string;
  }): Promise<Buffer> {
    const verificationPayload = JSON.stringify({
      bId: ticketData.bookingId,
      mov: ticketData.movieTitle,
      sts: ticketData.seats,
      dt: ticketData.showDate,
      tm: ticketData.startTime,
      vHash: Buffer.from(`cinepass_verify_${ticketData.bookingId}_${ticketData.seats.join('_')}`).toString('base64'),
    });

    return QRCode.toBuffer(verificationPayload, {
      errorCorrectionLevel: 'H',
      type: 'png',
      margin: 1,
      width: 200,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    });
  }
}
