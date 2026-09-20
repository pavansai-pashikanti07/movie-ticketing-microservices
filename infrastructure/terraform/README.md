# 🏗️ Infrastructure Directory (`infrastructure/terraform/`)

This directory contains production-ready **Terraform HCL modules** to provision the complete AWS cloud architecture for CinePass Microservices.

---

## 1. Cloud Resources We Use & Deep Technical Justifications

### 🌐 1. AWS VPC (Multi-AZ Architecture)
- **What is provisioned**: 1 VPC spanning **3 Availability Zones** (`ap-south-2a`, `ap-south-2b`, `ap-south-2c`), with 3 public subnets, 3 private application subnets, and 3 database subnets.
- **Why we need it**:
  - High Availability: If one AWS data center has a power failure, your services automatically failover to the other 2 AZs with zero downtime.
  - Security Boundaries: Microservice pods run inside **Private Subnets** with no public IP addresses. Database clusters run inside isolated **Database Subnets** that have zero internet routing.
- **NAT Gateways**:
  - Deployed in public subnets to allow private pods to pull Docker images from AWS ECR and call third-party payment gateways (Razorpay/Stripe) without exposing pods to inbound internet threats.

---

### ☸️ 2. AWS EKS (Elastic Kubernetes Service)
- **Why EKS instead of EC2 or ECS?**:
  - **EC2 Standalone (Monolith approach)**: No automated container self-healing, no declarative autoscaling, painful rolling updates with potential downtime.
  - **AWS ECS (Elastic Container Service)**: Good for simple setups, but lacks the rich cloud-native ecosystem (Helm, ArgoCD GitOps, KEDA event-driven autoscaling, Istio service mesh, Karpenter node autoscaling).
  - **AWS EKS**: The industry gold standard for microservices.
    - **Self-Healing**: If a pod crashes, Kubernetes restarts it in 1 second.
    - **Zero-Downtime Rolling Updates**: Deploys new microservice versions with zero downtime (`maxSurge`, `maxUnavailable`).
    - **Horizontal Pod Autoscaling (HPA)**: When Pushpa 2 ticket sales start and CPU spikes above 70%, EKS scales `booking-service` from 3 pods to 50 pods automatically!
- **Karpenter / Cluster Autoscaler**:
  - Spins up new EC2 worker nodes dynamically in 30 seconds when pods exhaust existing node capacity, and terminates them when traffic subsides to save costs.

---

### 🚪 3. Ingress: AWS Application Load Balancer (ALB) vs AWS API Gateway
- **Why we use AWS ALB (via AWS Load Balancer Controller)**:
  - **Cost-Efficiency**: AWS API Gateway charges **$3.50 per million requests**. At CinePass scale (100 million requests/month during blockbuster bookings), API Gateway alone would cost $350+/month! In contrast, AWS ALB has a fixed hourly cost (~$18/month) regardless of millions of requests.
  - **Direct Pod Routing (IP Target Mode)**: AWS ALB routes HTTP traffic directly to the private Kubernetes Pod IPs via AWS VPC CNI, eliminating extra proxy hops and giving sub-millisecond latency.
  - **Path-Based Routing**:
    - `/api/auth/*` ➔ routes to `auth-service`
    - `/api/movies/*` ➔ routes to `catalog-service`
    - `/api/bookings/*` ➔ routes to `booking-service`
    - `/api/payments/*` ➔ routes to `payment-service`

---

### 🛡️ 4. AWS WAF (Web Application Firewall) + AWS Shield
- **Why we need it**:
  - **Bot Mitigation**: Scalpers use automated Python scripts and headless browsers to book 50 front-row tickets within 2 seconds of booking opening.
  - **Rate Limiting**: AWS WAF blocks any IP issuing more than 100 requests per minute to `/api/bookings/hold`.
  - **DDoS Protection**: Mitigates layer 7 HTTP flood attacks before traffic reaches the EKS cluster.

---

### ⚡ 5. Amazon CloudFront (CDN)
- **Why we need it**:
  - Movie posters, trailers, backdrop graphics, and the SPA frontend HTML/CSS/JS are static assets.
  - CloudFront caches these assets in 400+ Edge locations worldwide (including Hyderabad, Mumbai, Bangalore, Chennai).
  - **Result**: Posters load in **10 milliseconds** for users, and 90% of traffic never touches our EKS servers or S3 buckets, drastically slashing server costs.

---

### 🪣 6. Amazon S3 (Simple Storage Service)
- **What it is used for**:
  1. **Movie Assets Bucket**: Storing original high-resolution movie posters, theater logos, seat map SVGs.
  2. **Ticket Storage Bucket**: Storing generated PDF tickets and dynamic QR code passes.
  3. **Terraform Remote State Bucket**: Centralized lock & state storage for Terraform (`terraform.tfstate`).
- **Why S3?**:
  - 99.999999999% (11 9's) durability. Storing images directly inside Docker containers or on EC2 EBS volumes bloats image sizes and causes data loss when containers restart.

---

### 📊 7. Observability: Amazon CloudWatch & Prometheus / Grafana
- **CloudWatch Container Insights**:
  - Collects CPU, memory, network, and disk metrics from every EKS node and container.
- **FluentBit to CloudWatch Logs**:
  - DaemonSet that streams all microservice stdout logs directly to CloudWatch Log Groups with retention policies (e.g. 14 days).
- **CloudWatch Alarms**:
  - Sends SNS alerts to Slack or email if error rate (HTTP 5xx) exceeds 1% or if a microservice pod restarts more than 5 times in 10 minutes.

---

### ⚡ 8. Amazon ElastiCache (Redis) vs DynamoDB
- **Why Redis for Seat Locking?**:
  - **Sub-millisecond Latency**: Redis executes in-memory commands (`SET seat:amb:s1:A1 user_123 NX EX 300`) in **under 1 millisecond**.
  - **Atomic Expiration (TTL)**: Redis keys expire automatically after 300 seconds (5 minutes). If the user closes their browser or payment fails, the seat unlocks automatically with ZERO cron jobs or cleanup scripts!
- **Why NOT DynamoDB for seat locking?**:
  - DynamoDB TTL is not real-time; DynamoDB deletes expired items within 48 hours of expiration, which is useless for a 5-minute seat reservation window!

---

### 🗄️ 9. Amazon RDS PostgreSQL (Multi-AZ with Read Replicas)
- **Why we use it**:
  - Financial integrity: Bookings and Payments MUST be ACID compliant (Atomicity, Consistency, Isolation, Durability).
  - **Read Replicas**: Separate heavy read queries (browsing movies, showtimes) to read-only replicas, keeping the primary database unburdened for writes.
  - **Multi-AZ Failover**: If the primary database hardware fails, AWS automatically fails over to the standby replica in under 60 seconds with zero data loss.

---

## 2. Cloud Resources We Intentionally DO NOT Use (And Why)

| Cloud Resource | Why We Do NOT Use It | What We Use Instead |
| :--- | :--- | :--- |
| **AWS API Gateway** | Too expensive at scale ($3.50 per 1M requests); adds cold starts and unnecessary latency for internal microservices | **AWS Application Load Balancer (ALB)** via EKS Ingress |
| **AWS DynamoDB for Ledger** | Lacks relational constraints, foreign keys, and complex SQL joins needed for auditoriums, screens, and accounting ledgers | **Amazon RDS PostgreSQL** (ACID Transactions) |
| **EC2 Standalone Instances** | No auto-healing, manual patching, complex multi-service networking, slow scaling during blockbuster sales | **AWS EKS with Auto-Scaling Node Groups** |
| **Elastic Beanstalk** | Monolithic PaaS abstraction with limited container orchestration and poor microservice mesh control | **AWS EKS (Kubernetes Native)** |
| **AWS CloudSearch** | High cost and vendor lock-in | **PostgreSQL Full-Text Search / OpenSearch** |
