# 💳 CinePass Payment Service (`services/payment-service`)

Enterprise Idempotent Payment Financial Ledger & AWS SQS Event Publisher for the CinePass movie ticketing platform.

---

## 🌟 Key Features
- **Strict Idempotency Engine**:
  - Requires `idempotencyKey` in body or `Idempotency-Key` header.
  - Guarantees customers will NEVER be double-charged even if they double-tap "Pay" or experience network timeouts.
- **Financial Transaction Ledger**:
  - Full audit trail (`INITIATED`, `PROCESSING`, `SUCCESS`, `FAILED`, `REFUNDED`).
  - Stores payment method (UPI, Cards, Net Banking) and gateway transaction reference.
- **Asynchronous Event-Driven Architecture (AWS SQS)**:
  - Publishes `TICKET_BOOKED` event payload to `cinepass-dev-booking-queue` in **sub-5 milliseconds**.
  - Decouples checkout latency from slow downstream PDF and dynamic QR generation.
  - Resilient local fallback when testing outside AWS.
- **Webhook Simulator**:
  - Handles payment gateway asynchronous status notifications.
- **Production Hardened**:
  - Helmet, CORS, graceful shutdown.
  - Multi-stage Alpine Dockerfile.

---

## 📡 API Endpoints

### 1. Process Idempotent Payment
```http
POST /api/payments/process
Content-Type: application/json
Idempotency-Key: idemp_tx_987654321

{
  "bookingId": 42,
  "userId": 101,
  "userEmail": "customer@example.com",
  "amount": 900,
  "paymentMethod": "UPI",
  "idempotencyKey": "idemp_tx_987654321",
  "movieDetails": {
    "movieTitle": "Pushpa 2: The Rule",
    "theaterName": "AMB Cinemas: Gachibowli",
    "screenName": "Screen 1 (Laser IMAX)",
    "showDate": "2026-10-05",
    "startTime": "11:15 AM",
    "seats": ["A1", "A2"]
  }
}
```
**Response (200 OK - First Attempt)**:
```json
{
  "success": true,
  "message": "Payment captured successfully. Ticket confirmed!",
  "data": {
    "payment": {
      "payment_id": "pay_1726937400_abcde",
      "booking_id": 42,
      "amount": "900.00",
      "status": "SUCCESS"
    },
    "sqsDispatch": {
      "messageId": "msg_sqs_12345",
      "dispatchLatencyMs": 4
    }
  }
}
```
**Response (200 OK - Idempotent Replay Attempt)**:
```json
{
  "success": true,
  "message": "Payment already processed (idempotent replay).",
  "idempotentReplay": true,
  "data": {
    "payment_id": "pay_1726937400_abcde",
    "booking_id": 42,
    "amount": "900.00",
    "status": "SUCCESS"
  }
}
```

### 2. SQS Event Schema (`TICKET_BOOKED`)
```json
{
  "eventType": "TICKET_BOOKED",
  "bookingId": 42,
  "paymentId": "pay_1726937400_abcde",
  "userId": 101,
  "userEmail": "customer@example.com",
  "movieTitle": "Pushpa 2: The Rule",
  "theaterName": "AMB Cinemas: Gachibowli",
  "screenName": "Screen 1 (Laser IMAX)",
  "showDate": "2026-10-05",
  "startTime": "11:15 AM",
  "seats": ["A1", "A2"],
  "totalAmount": 900,
  "timestamp": "2026-09-21T22:50:00.000Z"
}
```

### 3. Kubernetes Health Probe
```http
GET /health
```
