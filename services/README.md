# 🧩 CinePass Microservices Architecture (`services/`)

This directory contains the independent, domain-driven microservices powering the **CinePass Enterprise Movie Ticketing Platform**. Each service is isolated in its own folder with independent source code, dependencies, multi-stage `Dockerfile`, database schemas, and Kubernetes deployment manifests.

---

## 🏗️ 1. Domain-Driven Microservices Breakdown

Each microservice encapsulates a distinct business bounded context. Below is the comprehensive deep-dive into what each service does, why it is isolated, and its cloud dependency matrix.

```
                                      [ CinePass Ingress / ALB ]
                                                  │
                 ┌──────────────────┬─────────────┴──────────────┬──────────────────┐
                 ▼                  ▼                            ▼                  ▼
          ┌──────────────┐   ┌──────────────┐             ┌──────────────┐   ┌──────────────┐
          │ auth-service │   │catalog-service             │booking-service   │payment-service
          │ (JWT / RBAC) │   │ (Read-Heavy) │             │ (Seat Engine)│   │ (Idempotent) │
          └──────┬───────┘   └──────┬───────┘             └──────┬───────┘   └──────┬───────┘
                 │                  │                            │                  │
                 ▼                  ▼                            ▼                  ▼
            PostgreSQL         PostgreSQL + S3            Redis (Redlock)      PostgreSQL
            (User DB)          (Read Replica)             (Atomic Lock)        (Ledger DB)
                                                                 │                  │
                                                                 └──────────┬───────┘
                                                                            │ (Async Event)
                                                                            ▼
                                                                  ┌───────────────────┐
                                                                  │  AWS SQS Queue    │
                                                                  └─────────┬─────────┘
                                                                            │
                                                                            ▼
                                                                  ┌───────────────────┐
                                                                  │notification-serv..│
                                                                  │ (PDF / Email / WA)│
                                                                  └───────────────────┘
```

---

### 1. `auth-service/` (Identity & Access Management)
- **Primary Responsibility**:
  - User registration, password encryption with `bcrypt` (work factor 12).
  - Secure stateless JWT issuance (Access Token 15-min TTL, Refresh Token 7-day TTL).
  - Role-Based Access Control (RBAC): `CUSTOMER`, `THEATER_ADMIN`, `PLATFORM_SUPERADMIN`.
  - Token blacklisting and session revocation.
- **Why It Is an Independent Microservice**:
  - **Security Boundary**: The auth database containing user credentials, PII (Personally Identifiable Information), and password hashes is completely isolated. Even if the catalog service has a SQL vulnerability, the user credentials table remains physically unreachable.
  - **Burst Traffic Scaling**: Authentication traffic peaks sharply when blockbuster ticket bookings open (tens of thousands logging in simultaneously within seconds). Isolating it allows EKS to auto-scale `auth-service` independently.
- **Cloud Resources Used**:
  - **Amazon RDS PostgreSQL (User Schema)**: Relational integrity for user accounts, credentials, and role associations.
  - **AWS Secrets Manager**: Securely injects `JWT_SECRET` and signing keys directly into pods at runtime without saving keys in Git or container images.

---

### 2. `catalog-service/` (Movie & Showtime Engine)
- **Primary Responsibility**:
  - Manages Movies, Genres, Multiplexes, Auditoriums (Screens), and Showtime Schedules.
  - Exposes high-throughput endpoints: `GET /api/movies`, `GET /api/theaters/:id/showtimes`.
  - Full-text search and filtering by language, format (IMAX, 3D, 4DX), and location.
- **Why It Is an Independent Microservice**:
  - **95% Read-Heavy Traffic**: In ticketing apps, 95% of user interactions are browsing movies, watching trailers, and checking schedules. Only 5% proceed to checkout.
  - Separating catalog ensures heavy browsing queries **never exhaust CPU or database connection pools** of the checkout/booking engines.
- **Cloud Resources Used**:
  - **Amazon S3**: Object storage for original 4K movie posters, banner backdrops, and theater layout SVGs.
  - **Amazon CloudFront (CDN)**: Edge caching movie posters and catalog responses across 400+ Edge locations (sub-10ms latency).
  - **Amazon RDS PostgreSQL (Read Replicas)**: Dedicated read replicas offload catalog queries from primary transactional databases.
  - **Redis Cache**: In-memory caching for hot endpoints (e.g., today's showtimes cached with a 5-minute TTL).

---

### 3. `booking-service/` (High-Concurrency Distributed Seat Locking Engine)
- **Primary Responsibility**:
  - Dynamic seat map rendering (Seat status: `AVAILABLE`, `HELD`, `BOOKED`).
  - **Atomic 5-Minute Seat Holds**: Temporarily locks seats while the customer completes payment.
  - Concurrency conflict resolution (guaranteeing two users can NEVER select the same seat at the same microsecond).
- **Why It Is an Independent Microservice**:
  - This is the **most computationally intensive and concurrency-sensitive** component of the entire platform. During blockbuster ticket sales, 100,000+ users compete for the same 400 seats.
  - Running this inside a monolith locks database rows, causing connection starvation and crashing the entire website.
- **Cloud Resources Used**:
  - **Redis Distributed Locking (Redlock)**:
    - In-memory execution (`SET seat:<show_id>:<seat_no> <user_id> NX EX 300`).
    - Sub-millisecond execution (< 1ms latency).
    - **Automatic Self-Cleanup**: Redis key TTL (300 seconds) expires automatically if the user abandons payment. **Zero cron jobs or database cleanup scripts needed!**
  - **AWS SQS**: Emits `SeatReservedEvent` and `SeatReleasedEvent` for downstream audit and metrics.

---

### 4. `payment-service/` (Financial Transaction Ledger & Gateways)
- **Primary Responsibility**:
  - Secure integration with payment gateways (Razorpay, Stripe, Mock FastPay).
  - Webhook verification with cryptographic HMAC SHA256 signatures.
  - **Strict Idempotency**: Prevents double-charging if a user taps "Pay" multiple times or if network retries occur.
  - Financial ledger recording with audit trails (`INITIATED`, `AUTHORIZED`, `CAPTURED`, `FAILED`, `REFUNDED`).
- **Why It Is an Independent Microservice**:
  - **Compliance Isolation (PCI-DSS)**: Isolates financial payment logic and webhook handlers from the rest of the application.
  - Strict fault tolerance: Even if notification or catalog fails, payment confirmation and ledger recording must remain 100% ACID compliant.
- **Cloud Resources Used**:
  - **Amazon RDS PostgreSQL**: ACID-compliant transactional ledger.
  - **AWS KMS**: Cryptographic envelope encryption for gateway merchant secrets.
  - **AWS SQS**: Emits `PaymentCompletedEvent` upon successful bank webhook confirmation.

---

### 5. `notification-service/` (Async Ticket Generator & Dispatcher)
- **Primary Responsibility**:
  - Generates official CinePass PDF boarding passes with embedded dynamic encrypted QR codes.
  - Dispatches ticket confirmations via Email (HTML template) and WhatsApp / SMS.
  - Asynchronously consumes events from the message queue.
- **Why It Is an Independent Microservice**:
  - **Decoupled Latency**: Generating a PDF ticket with a QR code and sending an external email takes **2 to 5 seconds**. If this were synchronous inside `payment-service`, the user would be stuck on a loading screen for 5 seconds after their payment succeeded!
  - By offloading this to an async worker, the user gets an **instant "Booking Confirmed!"** screen, while the notification worker processes the PDF in the background.
- **Cloud Resources Used**:
  - **AWS SQS (Simple Queue Service)**: Reliable FIFO / Standard message ingestion from `payment-service`.
  - **Amazon S3**: Permanent storage for generated PDF tickets and QR code images.
  - **Amazon SES / SNS**: Enterprise transactional email and SMS delivery.

---

## 🔄 2. Communication Strategy: Sync vs Async

| Interaction Flow | Pattern | Protocol / Mechanism | Technical Justification |
| :--- | :--- | :--- | :--- |
| **Frontend ➔ Any Service** | Synchronous | HTTP/REST via Ingress (ALB) | Instant feedback required for UI rendering, logins, and seat browsing. |
| **Booking ➔ Redis Seat Lock** | Synchronous | In-memory Redis TCP | Millisecond-level atomic verification of whether a seat is free or locked. |
| **Booking ➔ Payment** | Synchronous | Internal HTTP / gRPC | Payment checkout session must be generated immediately with a signed payment order ID. |
| **Payment ➔ Notification** | **Asynchronous** | **AWS SQS Message Queue** | **Fire-and-forget**: Payment service emits event and finishes. PDF/Email processing happens in background without blocking user checkout. |

---

## ☁️ 3. Cloud Services We USE & Why

| AWS Cloud Service | Component / Purpose in CinePass | Why This Specific Service? | Cost & Free Tier Strategy |
| :--- | :--- | :--- | :--- |
| **AWS EKS (v1.30)** | Microservices Container Orchestrator | Self-healing pods, zero-downtime rolling deployments, Horizontal Pod Autoscaling (HPA). | **Session Spin-up**: Test & destroy (~$0.10/hr). |
| **EC2 Spot Managed Nodes** | EKS Worker Compute Pool | Runs the pods across multiple Availability Zones with auto-drain support. | **Spot Instances (`t3.medium`)**: **70-80% discount (~₹1/hr per node)**. |
| **AWS ECR** | Container Image Registry | Secure, private Docker registry tightly integrated with AWS IAM and EKS. | **Free Tier Eligible (500 MB/month)**. |
| **AWS VPC (Multi-AZ)** | 3-AZ Network Isolation | Isolates public ALB from private microservice pods and database subnets. | **100% Free** (VPC has zero AWS charges). |
| **AWS Application Load Balancer**| EKS Ingress Controller | Path-based routing (`/api/auth`, `/api/bookings`) direct to Pod private IPs via AWS VPC CNI. | Managed by AWS Load Balancer Controller. |
| **AWS RDS PostgreSQL 16** | Core ACID Database | Financial transaction integrity, user accounts, and relational ticket records. | **Free Tier Eligible (`db.t3.micro`, 750 hrs/month)**. |
| **Redis (ElastiCache / Pod)** | In-Memory Distributed Lock | Sub-millisecond atomic seat lock (`NX EX 300`) with automatic 5-min TTL self-cleanup. | Dev K8s internal Redis pod = **₹0.00** (or `cache.t3.micro`). |
| **AWS SQS (Simple Queue)** | Decoupled Async Event Bus | Connects `payment-service` to `notification-service` reliably without dropping events. | **100% FREE FOREVER (First 1 Million requests/month Free)**. |
| **Amazon S3** | Object Storage | Stores movie posters, ticket PDFs, seat layouts, and Terraform remote state. | **Free Tier Eligible (5 GB free)**. |
| **Amazon CloudFront** | Edge CDN | Caches static movie posters in 400+ PoPs worldwide (sub-10ms image load). | **Free Tier Eligible (1 TB data transfer/month)**. |
| **AWS IAM with OIDC (IRSA)**| Pod-Level Security | Grants temporary AWS tokens to pods via ServiceAccounts without hardcoded keys. | **100% Free** (IAM has no charges). |
| **Amazon CloudWatch** | Centralized Logging & Alarms | Collects container stdout logs and triggers alerts on HTTP 5xx error spikes. | **Free Tier Eligible (5 GB log ingestion)**. |

---

## 🚫 4. Cloud Services We DO NOT USE (And Detailed Technical Justifications)

In enterprise cloud architecture, **knowing what NOT to use and why is as important as knowing what to use**. Below is the architectural evaluation of services intentionally rejected for CinePass:

| Evaluated AWS Service | Why We Evaluated It | Why We Intentionally REJECTED It | What We Use Instead |
| :--- | :--- | :--- | :--- |
| **1. AWS MSK (Managed Kafka)** | Streaming event logs across microservices | **Prohibitive Cost**: Minimum cluster requires 3 broker nodes costing **$150+/month (~₹12,500/mo)**. For our 5 microservices, Kafka's operational overhead and cost are unjustifiable overkill. | **AWS SQS** (1M free requests/month, zero cluster management) or **Redis Pub/Sub**. |
| **2. AWS API Gateway** | Managed API Gateway & Reverse Proxy | **Excessive Costs at Scale & High Latency**: Charges $3.50 per 1M requests. During blockbuster ticket drops (50M requests), bill would exceed $175+. Furthermore, API Gateway cannot route directly to private Pod IPs without expensive VPC Links. | **AWS Application Load Balancer (ALB)** via Ingress Controller. Flat hourly rate, routes directly to Pod IPs in sub-milliseconds. |
| **3. AWS NAT Gateway** | Outbound internet access for private subnets | **Idle Running Charges**: AWS charges **$0.045/hr (~$32.40/mo = ₹2,700/mo)** even if zero data passes through it! | **Dev FinOps Strategy**: Place worker nodes in Public Subnets protected by strict Security Groups, routing outbound via **Internet Gateway (100% FREE)**. |
| **4. AWS Aurora Serverless v2** | Auto-scaling relational database | **No Free Tier**: Minimum capacity (0.5 ACU) runs 24/7 and costs **~$45/month (~₹3,700/mo)**. | **Amazon RDS PostgreSQL (`db.t3.micro`)** which is **100% Free Tier eligible** (750 hrs/mo). |
| **5. AWS DynamoDB** | NoSQL database for ticket booking | **Lack of Multi-Table ACID & Bad TTL**: Ticketing requires relational joins across Theaters ➔ Screens ➔ Shows ➔ Seats. DynamoDB lacks rich SQL constraints. Furthermore, DynamoDB TTL is not real-time (deletes items up to 48 hours late, useless for a 5-minute seat hold). | **Amazon RDS PostgreSQL** (ACID Ledger) + **Redis** (Real-time sub-millisecond atomic TTL). |
| **6. AWS Lambda (Serverless)** | Serverless compute for microservices | **DB Connection Exhaustion & Cold Starts**: Lambda creates a new container per concurrent request. 5,000 concurrent ticket buyers would spin up 5,000 Lambdas, instantly exhausting RDS PostgreSQL connection limits (causing `FATAL: too many connections`). | **AWS EKS Containers** with persistent connection pooling (`pg-pool`). |
| **7. AWS App Mesh** | Service Mesh for microservices | **Officially Deprecated**: AWS announced the deprecation and end-of-life for AWS App Mesh. | Standard **Kubernetes CoreDNS + ClusterIP Services** (zero proxy sidecar CPU overhead). |
| **8. AWS CodePipeline / CodeBuild** | Cloud-native CI/CD pipeline | **Vendor Lock-in & Clunky Developer Experience**: AWS CodePipeline UI is slow, charges $1/active pipeline, and limits local debugging. | **GitHub Actions with AWS OIDC**: 2,000 free minutes/month, zero static keys, code and CI live together in Git. |
| **9. AWS Route 53** | DNS routing & domain hosting | **Paid Hosted Zone**: Charges $0.50/month per hosted zone. For development and testing without a purchased domain, it is an unnecessary expense. | **ALB Auto-Generated DNS** (e.g., `k8s-alb-xxx.ap-south-1.elb.amazonaws.com`) which is **100% Free**. |
| **10. AWS WAF (Web App Firewall)** | Bot mitigation & DDoS protection | **High Base Cost**: Charges $5/WebACL + $1/rule/month + $0.60 per 1M requests. Overkill for dev/test environments. | Kubernetes Ingress rate-limiting annotations for dev; WAF can be enabled via Terraform variable for production. |
| **11. AWS X-Ray** | Distributed Request Tracing | **Proprietary & Per-Trace Billing**: High trace sampling charges and AWS vendor lock-in. | **OpenTelemetry + Jaeger / Prometheus** inside Kubernetes (Cloud-native, 100% Free and Open-Source). |

---

## 🎯 5. Architecture Summary for Interviews & Design Reviews

When presenting CinePass to technical interviewers or lead architects, emphasize these 4 pillars:

1. **True Domain-Driven Design**: The read-heavy catalog is separated from the write-heavy booking engine; the payment ledger is isolated for PCI compliance; notification generation is asynchronous.
2. **Distributed Concurrency Handling**: Seats are never locked in the relational database using slow row locks; Redis Redlock guarantees atomic sub-millisecond holds with automatic 5-minute TTL expiration.
3. **FinOps Cost Engineering**: Expensive services (Kafka, NAT Gateways, Aurora Serverless, API Gateway) were deliberately rejected in favor of high-performance, cost-effective alternatives (SQS, ALB Ingress, RDS Free Tier, Spot EKS nodes).
4. **Zero-Secret Cloud Security**: Microservices communicate with AWS services using **IAM Roles for Service Accounts (IRSA)** via OIDC — zero static AWS access keys or passwords anywhere in the codebase.
