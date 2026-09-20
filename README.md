# 🎬 CinePass: Cloud-Native Microservices Architecture
### Enterprise Movie Ticketing Platform (BookMyShow / Fandango Scale)
**Engineered with AWS EKS, GitHub Actions OIDC, Terraform, Event-Driven Messaging, and GitOps**

---

## 1. Executive Summary & Vision

While the **CinePass Monolith** was deployed on a single AWS EC2 instance with AWS RDS, scaling to millions of concurrent ticket buyers during blockbuster releases (e.g. Pushpa 2, Kalki 2898 AD) requires an **Enterprise Cloud-Native Microservices Architecture**.

This architecture decouples business capabilities into independently scalable, resilient microservices running on **AWS EKS (Elastic Kubernetes Service)** with **Event-Driven Architecture (EDA)**, **Distributed Seat Locking**, and **GitOps CI/CD via GitHub Actions**.

---

## 2. High-Level Architecture Diagram

```
                              [ Users & Mobile App ]
                                        │
                                        ▼ (HTTPS / Route53)
                            ┌────────────────────────┐
                            │  AWS CloudFront + WAF  │ (DDoS Protection & Edge Caching)
                            └───────────┬────────────┘
                                        │
                                        ▼
                        ┌─────────────────────────────────┐
                        │   AWS ALB (Application LB)      │ (Managed by AWS Load Balancer Controller)
                        └───────────────┬─────────────────┘
                                        │
┌─────────────────────────────── EKS CLUSTER ──────────────────────────────────────────┐
│                                       │                                              │
│                                       ▼                                              │
│                       ┌───────────────────────────────┐                              │
│                       │   Ingress Controller / Gateway│                              │
│                       └───────────────┬───────────────┘                              │
│                                       │                                              │
│         ┌──────────────────┬──────────┴───────────┬──────────────────┐               │
│         ▼                  ▼                      ▼                  ▼               │
│  ┌──────────────┐   ┌──────────────┐      ┌──────────────┐    ┌──────────────┐       │
│  │ Auth Service │   │ Movie Catalog│      │Booking/Lock  │    │Payment Svc   │       │
│  │  (Node/Go)   │   │  Service     │      │   Service    │    │ (Idempotent) │       │
│  └──────┬───────┘   └──────┬───────┘      └──────┬───────┘    └──────┬───────┘       │
│         │                  │                     │                   │               │
│         │                  │                     │                   │               │
└─────────┼──────────────────┼─────────────────────┼───────────────────┼───────────────┘
          │                  │                     │                   │
          ▼                  ▼                     ▼                   ▼
    ┌───────────┐      ┌───────────┐         ┌───────────┐       ┌───────────┐
    │  RDS Auth │      │ Read-Repl │         │ElastiCache│       │  RDS Pay  │
    │ PostgreSQL│      │  Postgres │         │   Redis   │       │ PostgreSQL│
    │   (ACID)  │      │ (Catalog) │         │(Seat Lock)│       │ (Ledger)  │
    └───────────┘      └───────────┘         └───────────┘       └───────────┘
                                                   │
                                                   ▼
                                        ┌───────────────────────┐
                                        │  Event Bus (AWS MSK / │ (Async decoupled events)
                                        │   Kafka / AWS SQS)    │
                                        └──────────┬────────────┘
                                                   │
                                                   ▼
                                        ┌───────────────────────┐
                                        │ Notification Service  │ ──► [ AWS SES / SNS ]
                                        │ (Email/SMS Tickets)   │     (WhatsApp / Email)
                                        └───────────────────────┘
```

---

## 3. Microservices Decomposition

| Microservice | Primary Responsibility | Recommended Tech Stack | Dedicated Data Store |
| :--- | :--- | :--- | :--- |
| **`api-gateway`** | Central reverse proxy, rate limiting, JWT validation | Kong / Envoy / NGINX Ingress | In-memory cache |
| **`auth-service`** | User login, registration, JWT issuance, RBAC, OAuth2 | Node.js (TypeScript) / Go | AWS RDS PostgreSQL (User Schema) |
| **`catalog-service`**| Movie catalog, genres, multiplexes, auditoriums, schedules | Node.js / Python FastApi | AWS RDS PostgreSQL (Read Replicas) + Redis Cache |
| **`booking-service`**| High-concurrency seat selection, 5-minute atomic holds | Go (Goroutines) / Node.js | **AWS ElastiCache Redis** (Distributed Redlock) |
| **`payment-service`**| FastPay / Razorpay / Stripe webhooks, payment state machine | Node.js (TypeScript) | AWS RDS PostgreSQL (Financial Ledger) |
| **`notification-service`** | Async ticket generation (QR Code, PDF), WhatsApp/Email | Python / Node.js Worker | Consumes from AWS SQS / Kafka Event Bus |

---

## 4. Required AWS Cloud Infrastructure (Terraform)

### 1. Networking Foundation (VPC)
- **VPC with 3 Availability Zones** (`ap-south-2a`, `ap-south-2b`, `ap-south-2c`).
- **Subnet Layout**:
  - `3x Public Subnets`: For ALBs and NAT Gateways.
  - `3x Private App Subnets`: For EKS Worker Nodes (No public IPs).
  - `3x Isolated DB Subnets`: For RDS and ElastiCache clusters.
- **NAT Gateways**: Managed outbound internet for private EKS nodes to pull container images and reach third-party APIs.

### 2. Compute & Orchestration (AWS EKS)
- **AWS EKS Control Plane**: Managed Kubernetes v1.30+.
- **EKS Managed Node Groups**: Auto-scaling groups (`t3.medium` / `m5.large`) with Spot + On-Demand instances.
- **Karpenter / Cluster Autoscaler**: Auto-provision EC2 nodes in seconds when ticket surges occur.
- **IAM Roles for Service Accounts (IRSA)**: Pods receive temporary AWS IAM credentials without static access keys.

### 3. Container Registries (AWS ECR)
- Dedicated ECR Repositories for each microservice (`cinepass/auth-service`, `cinepass/booking-service`, etc.).
- Image scanning on push enabled (Vulnerability scanning).
- Lifecycle policies to prune older untagged images.

### 4. Managed Databases & Caching
- **Amazon RDS PostgreSQL**: Multi-AZ with automated backups and read replicas.
- **Amazon ElastiCache (Redis Cluster)**: High-speed in-memory store for real-time seat lock countdowns (TTL 300s).
- **Amazon SQS & SNS / AWS MSK**: Asynchronous message queues between Booking, Payment, and Notification services.

### 5. Ingress, Security & Routing
- **AWS Load Balancer Controller**: Provisions Application Load Balancers (ALB) via Kubernetes Ingress manifests.
- **AWS Certificate Manager (ACM)**: Free automated SSL/TLS certificates.
- **ExternalDNS**: Syncs Kubernetes ingress hostnames to Amazon Route53.

---

## 5. CI/CD Pipeline Architecture (GitHub Actions + GitOps)

```
[ Developer ] ──► git push ──► [ GitHub Actions Workflow ]
                                       │
                                       ├─ 1. Run Unit Tests & Lint
                                       ├─ 2. AWS OIDC Authentication (Zero Keys!)
                                       ├─ 3. Docker Build & Push to AWS ECR
                                       │
                                       ▼
                               [ GitOps Repo / Helm ]
                                       │
                                       ▼
                              [ ArgoCD on EKS ] ──► Syncs & Deploys Pods to EKS
```

### Why GitHub Actions + AWS OIDC?
- **No Long-Lived Credentials**: We do **NOT** store `AWS_ACCESS_KEY_ID` or `AWS_SECRET_ACCESS_KEY` in GitHub Secrets.
- **GitHub OpenID Connect (OIDC)**: GitHub Actions requests a short-lived token (15 mins) directly from AWS IAM using an assumed role (`arn:aws:iam::...:role/github-actions-eks-role`).

---

## 6. Directory Structure for the Microservices Project

```text
movie-ticketing-microservices/
├── .github/
│   └── workflows/
│       ├── ci-auth-service.yaml
│       ├── ci-catalog-service.yaml
│       ├── ci-booking-service.yaml
│       ├── ci-payment-service.yaml
│       ├── ci-notification-service.yaml
│       └── cd-eks-deploy.yaml
├── services/
│   ├── auth-service/
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   └── src/
│   ├── catalog-service/
│   │   ├── Dockerfile
│   │   └── src/
│   ├── booking-service/
│   │   ├── Dockerfile
│   │   └── src/
│   ├── payment-service/
│   │   ├── Dockerfile
│   │   └── src/
│   └── notification-service/
│       ├── Dockerfile
│       └── src/
├── infrastructure/
│   └── terraform/
│       ├── modules/
│       │   ├── vpc/
│       │   ├── eks/
│       │   ├── ecr/
│       │   ├── rds/
│       │   └── elasticache/
│       └── envs/
│           └── prod/
│               ├── main.tf
│               └── variables.tf
└── k8s/
    ├── helm/
    │   └── cinepass-app/
    │       ├── Chart.yaml
    │       ├── values.yaml
    │       └── templates/
    └── overlays/
        ├── dev/
        └── prod/
```

---

## 7. Implementation Roadmap (Next Steps)

1. **Step 1**: Terraform Infrastructure Provisioning:
   - Setup 3-AZ VPC with NAT Gateways.
   - Setup AWS EKS Cluster with Managed Node Groups.
   - Setup AWS ECR repositories for each service.
2. **Step 2**: Microservices Codebase & Containerization:
   - Break down monolithic domains into independent Node/TypeScript services.
   - Write optimized, multi-stage Alpine Dockerfiles for each service.
3. **Step 3**: GitHub Actions Workflows:
   - Configure AWS OIDC IAM Role.
   - Create GitHub Actions pipeline to build and push Docker images to ECR upon PR merge.
4. **Step 4**: Kubernetes & Helm Manifests:
   - Deploy AWS Load Balancer Controller.
   - Write Helm charts with HPA (Horizontal Pod Autoscalers), Resource Limits, and Health Probes.
5. **Step 5**: GitOps Deployment:
   - Setup ArgoCD on EKS for automated continuous deployment.

---

## 8. AWS Cloud Services Matrix: Used vs Not Used (The "Why" Breakdown)

| AWS Cloud Service | Status | Why We Use It / Why We Avoid It |
| :--- | :--- | :--- |
| **AWS ALB (Application Load Balancer)** | **USED** | Routes incoming traffic to EKS Pods based on URL paths (`/api/movies`, `/api/bookings`). Supports IP Target Mode for direct, sub-millisecond pod communication. |
| **AWS API Gateway** | **NOT USED** | **Cost & Latency Reason**: At BookMyShow scale (100M+ requests), API Gateway charges $3.50/M ($350+/mo) plus cold start latency. ALB has fixed predictable hourly cost and native Kubernetes controller integration. |
| **Amazon CloudFront** | **USED** | **Edge Performance**: Caches static movie posters, videos, and frontend assets in 400+ Edge locations. Cuts latency from 300ms down to 10ms for end users. |
| **AWS WAF (Web Application Firewall)** | **USED** | **Anti-Scalper & Bot Protection**: Restricts automated bot scripts from hoarding 50 front-row seats in 1 second. Blocks malicious IPs and rate-limits booking endpoints. |
| **Amazon S3** | **USED** | **Durable Media & State**: Stores generated PDF tickets, dynamic QR codes, high-res posters, and Terraform remote state files. |
| **Amazon CloudWatch** | **USED** | **Centralized Telemetry**: Container Insights collects CPU/Memory across all EKS nodes; FluentBit streams pod logs; CloudWatch Alarms send alerts on high 5xx error rates. |
| **Amazon ElastiCache (Redis)** | **USED** | **In-Memory Seat Locking**: Atomic 5-minute countdown locks using Redis keys (`EX 300`). Handles 100,000+ ops/sec without touching the primary database. |
| **AWS DynamoDB** | **NOT USED** | **Relational Constraint Reason**: Ticket booking requires relational tables (theaters ➔ screens ➔ seats ➔ showtimes) and ACID financial ledgers. DynamoDB lacks joins and real-time 5-minute TTL deletion. |
| **Amazon RDS PostgreSQL** | **USED** | **Financial & Business Truth**: Multi-AZ PostgreSQL for user accounts, booking records, and payment ledgers with strict ACID transactions. |
| **Amazon SQS & SNS** | **USED** | **Async Decoupling**: Once payment succeeds, an event is posted to SQS. The notification worker generates PDFs and sends emails asynchronously without delaying the user's checkout response. |
| **AWS EKS (Kubernetes)** | **USED** | **Orchestration**: Self-healing containers, declarative HPA autoscaling (3 to 50 pods during surges), zero-downtime rolling updates. |
| **AWS ECS / Fargate** | **NOT USED** | Lacks the rich cloud-native ecosystem (Karpenter node provisioning, Helm charts, ArgoCD GitOps, KEDA event-driven scaling). |
| **Amazon Route53 & ACM** | **USED** | Global DNS management with automatic SSL/TLS encryption certificates (HTTPS). |

