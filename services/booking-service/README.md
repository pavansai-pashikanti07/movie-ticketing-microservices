# 🎟️ CinePass Booking Service (`services/booking-service`)

High-Concurrency Seat Reservation & Distributed Atomic Locking microservice for the CinePass movie ticketing platform.

---

## 🌟 The Concurrency Problem & Our Solution
During blockbuster movie ticket releases (e.g. *Pushpa 2*, *Kalki 2898 AD*), 100,000+ fans rush to click the same seats simultaneously.

### Why Relational DBs Fail Under Contention:
- Running `SELECT ... FOR UPDATE` in PostgreSQL locks rows and tables.
- 5,000 concurrent connection requests exhaust database connection pools in seconds, crashing the website.

### How CinePass Solves It (Redis Atomic Distributed Locks):
- `booking-service` issues atomic Redis commands:
  ```bash
  SET lock:show:1:seat:A1 <user_id> NX EX 300
  ```
  - **`NX`**: Only set the key if it does NOT already exist.
  - **`EX 300`**: Sets an automatic expiration TTL of 300 seconds (5 minutes).
- **Sub-Millisecond Execution**: The first user acquires the lock in **under 1 millisecond**.
- **Collision Prevention**: All other users attempting to click the same seat immediately receive `409 Conflict`.
- **Zero-Maintenance Automatic Release**: If the customer abandons checkout, closes their phone, or payment fails, **Redis automatically evicts the lock key after 5 minutes**. Zero cron jobs or cleanup background scripts required!

---

## 📡 API Endpoints

### 1. Hold Seats (5-Minute Atomic Lock)
```http
POST /api/bookings/hold
Content-Type: application/json

{
  "showId": 1,
  "seats": ["A1", "A2"],
  "userId": 101,
  "totalAmount": 900
}
```
**Response (201 Created)**:
```json
{
  "success": true,
  "message": "Seats held successfully for 5 minutes.",
  "data": {
    "bookingId": 42,
    "showId": 1,
    "seats": ["A1", "A2"],
    "totalAmount": 900,
    "status": "HELD",
    "expiresAt": "2026-09-21T22:50:00.000Z",
    "countdownSeconds": 300
  }
}
```
**Collision Response (409 Conflict)**:
```json
{
  "success": false,
  "message": "Seat 'A1' is currently held by another customer. Please select another seat.",
  "conflictSeats": ["A1"]
}
```

### 2. Live Seat Map (Real-Time Status)
```http
GET /api/bookings/show/:showId/seats
```
**Response (200 OK)**:
```json
{
  "success": true,
  "showId": 1,
  "bookedSeats": ["C1", "C2", "D5"],
  "heldSeats": ["A1", "A2"],
  "totalUnavailable": 5
}
```

### 3. Confirm Booking (Post-Payment)
```http
POST /api/bookings/:bookingId/confirm
```
- Inserts seats into PostgreSQL `booked_seats` table with unique constraint.
- Releases temporary Redis locks.
- Transitions booking to `CONFIRMED`.

### 4. Release Seat Hold (Customer Cancel)
```http
POST /api/bookings/:bookingId/release
```

### 5. Kubernetes Health Probe
```http
GET /health
```
```json
{
  "status": "UP",
  "service": "cinepass-booking-service",
  "database": "CONNECTED",
  "seatLockEngine": "REDIS_DISTRIBUTED",
  "timestamp": "2026-09-21T22:45:00.000Z"
}
```
