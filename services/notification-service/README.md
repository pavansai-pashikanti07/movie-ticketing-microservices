# 📬 CinePass Notification Service (`services/notification-service`)

Asynchronous SQS Event Consumer, Dynamic QR Code Generator, PDF Boarding Pass Builder & S3 Uploader for the CinePass movie ticketing platform.

---

## 🌟 Key Features
- **Event-Driven Asynchronous Consumer**:
  - Long-polls Amazon SQS queue (`cinepass-dev-booking-queue`) with a 10-second wait time (zero empty polling fees).
  - Automatically receives `TICKET_BOOKED` events emitted by `payment-service`.
  - Guarantees poison-pill isolation: If an invalid email crashes PDF parsing 3 times, the message is automatically redriven to the Dead-Letter Queue (`cinepass-dev-booking-queue-dlq`).
- **Dynamic QR Code Barcode Generation**:
  - Programmatically encodes cryptographic booking verification hash, movie title, screen, date, and seats into a scannable high-resolution QR matrix.
- **PDF Boarding Pass Compiler**:
  - Compiles a landscape A5 CinePass Digital Boarding Pass using `pdfkit`.
  - Embeds the generated dynamic QR code, customer name, auditorium details, and ticket seat numbers.
- **Amazon S3 & CloudFront CDN Storage**:
  - Uploads generated ticket PDFs to private Amazon S3 bucket (`cinepass-assets-07784`).
  - Returns CloudFront edge delivery URL (`https://assets.cinepass.com/tickets/ticket_<id>.pdf`).
- **Audit Logging**:
  - Records delivery status in PostgreSQL `notification_logs` table.
- **Dual Runtime**:
  - Runs continuous background worker loop while exposing an Express HTTP server for Kubernetes health probes (`/health`).

---

## 📡 API Endpoints

### 1. Test Ticket Generation
```http
POST /api/notifications/test-generate
Content-Type: application/json

{
  "bookingId": 101,
  "paymentId": "pay_live_test_778",
  "movieTitle": "Pushpa 2: The Rule",
  "theaterName": "AMB Cinemas: Gachibowli",
  "screenName": "Screen 1 (Laser IMAX)",
  "showDate": "2026-10-05",
  "startTime": "11:15 AM",
  "seats": ["A1", "A2"],
  "totalAmount": 900,
  "customerEmail": "pavan@example.com"
}
```
**Response (200 OK)**:
```json
{
  "success": true,
  "message": "Ticket PDF and verification QR generated successfully.",
  "data": {
    "bookingId": 101,
    "pdfSizeBytes": 32456,
    "ticketPdfUrl": "https://assets.cinepass.com/tickets/ticket_101_1726938000000.pdf",
    "customerEmail": "pavan@example.com"
  }
}
```

### 2. Notification Audit History
```http
GET /api/notifications/history/:bookingId
```

### 3. Kubernetes Health Probe
```http
GET /health
```
```json
{
  "status": "UP",
  "service": "cinepass-notification-service",
  "database": "CONNECTED",
  "sqsConsumer": "ACTIVE",
  "timestamp": "2026-09-21T22:50:00.000Z"
}
```
