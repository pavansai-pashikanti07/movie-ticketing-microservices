# 🧩 Microservices Directory (`services/`)

This directory contains the independent, domain-driven microservices that power the CinePass platform. Each microservice is containerized with its own multi-stage `Dockerfile`, dependencies, and database integration.

---

## 1. Microservices Breakdown & Justifications

### 1. `auth-service/`
- **What it does**: User registration, login, JWT token issuance, RBAC (Role-Based Access Control), and password hashing.
- **Why it is a separate service**:
  - Auth load is bursty during sale openings (thousands logging in at once).
  - Security isolation: Auth database containing hashed passwords (`bcrypt`) is completely separated from movie catalogs and public data.
- **Cloud Resources Used**:
  - **Amazon RDS PostgreSQL (User DB)**: Relational schema for users, roles, password hashes.
  - **AWS Secrets Manager**: Stores the JWT private/public signing keys so they are never hardcoded in code or Git.

---

### 2. `catalog-service/`
- **What it does**: Read-heavy service providing the catalog of Movies, Theaters, Auditoriums (Screens), and Daily Showtimes.
- **Why it is a separate service**:
  - 95% of traffic on movie apps is browsing ("read-heavy"). Decoupling it ensures that heavy catalog browsing NEVER impacts checkout or seat holding.
- **Cloud Resources Used**:
  - **Amazon S3**: Stores movie posters, hero banners, and promotional media.
  - **Amazon CloudFront**: Caches movie posters and catalog responses at edge locations in Hyderabad/India for sub-10ms response times.
  - **Amazon RDS PostgreSQL (Read Replicas)**: Serves catalog queries without placing load on the primary transactional DB.
  - **AWS ElastiCache (Redis)**: Caches `GET /movies` and `GET /theaters` queries (TTL 5 minutes).

---

### 3. `booking-service/` (The Core Concurrency Engine)
- **What it does**: Real-time seat layouts, dynamic seat selection, and atomic **5-minute seat locks** (holding seats while users pay).
- **Why it is a separate service**:
  - This is the highest-concurrency, mission-critical component. When tickets open for a blockbuster, 100,000 users try to select the same seats simultaneously.
- **Cloud Resources Used**:
  - **AWS ElastiCache Redis (Cluster Mode)**: Uses Redis distributed locks (`Redlock` algorithm) with key expiration (`EX 300`). 
  - **Why NOT relational DB for locking?**: Running `SELECT ... FOR UPDATE` on 100,000 concurrent requests will lock up PostgreSQL table rows, exhaust connection pools, and crash the database. Redis handles 100,000+ operations/sec in-memory with sub-millisecond latency.
  - **Amazon SQS / SNS**: Publishes a `SeatReservedEvent` or `SeatReleasedEvent` to the event bus.

---

### 4. `payment-service/`
- **What it does**: Processes checkout with payment gateways (FastPay, Razorpay, Stripe), verifies signatures, manages idempotency, and records financial transactions.
- **Why it is a separate service**:
  - Payment compliance (PCI-DSS) requires stringent isolation.
  - Idempotency guarantees: A user double-clicking "Pay" must NEVER be charged twice.
- **Cloud Resources Used**:
  - **Amazon RDS PostgreSQL (Transactional Ledger)**: Strict ACID compliance to track payments (`INITIATED`, `SUCCESS`, `REFUNDED`).
  - **AWS KMS (Key Management Service)**: Encrypts payment secrets and webhook credentials.
  - **Amazon SQS / SNS**: Emits `PaymentCompletedEvent` upon successful bank webhook confirmation.

---

### 5. `notification-service/`
- **What it does**: Asynchronous worker that generates digital boarding pass tickets (PDF with dynamic QR codes), sends WhatsApp confirmations and booking emails.
- **Why it is a separate service**:
  - Generating PDF tickets and sending emails/SMS takes 2 to 5 seconds per ticket. 
  - If handled synchronously in the payment service, users would wait 5 seconds on the checkout screen. Decoupling this into an async worker gives the user an instantaneous "Booking Confirmed" screen!
- **Cloud Resources Used**:
  - **Amazon SQS**: Pulls `PaymentCompletedEvent` messages from the queue.
  - **Amazon S3**: Uploads generated ticket PDFs and QR codes for permanent user retrieval.
  - **Amazon SES (Simple Email Service)**: Sends transactional ticket confirmation emails.
  - **Amazon SNS**: Sends SMS alerts with booking references.

---

## 2. Communication Strategy: Sync vs Async

| Interaction | Pattern | Protocol | Why? |
| :--- | :--- | :--- | :--- |
| **Frontend ➔ Services** | Synchronous | REST / JSON via Ingress | Instant user feedback for login, movie search, seat selection |
| **Booking ➔ Seat Lock** | Synchronous | In-Memory Redis Protocol | Must know instantly if seat is locked or taken by someone else |
| **Booking ➔ Payment** | Synchronous | Internal gRPC / HTTPS | Immediate session creation for checkout gateway |
| **Payment ➔ Notification** | **Asynchronous** | Amazon SQS / Event Bus | PDF generation and emails must never block or slow down user checkout |
