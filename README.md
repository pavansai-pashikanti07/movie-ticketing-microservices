# 🎬 CinePass — Cloud-Native Movie Ticketing Platform

> **Production-grade microservices architecture** built on AWS EKS, deployed via GitHub Actions OIDC + Argo CD GitOps, orchestrated with Kubernetes, and accessible via a full-stack web UI.
>
> 📖 **Architecture & Operations Guide:** For complete GitOps lifecycle, Argo CD access, and dual-mode delivery, see [GITOPS_ARCHITECTURE.md](GITOPS_ARCHITECTURE.md).

---

## 📐 System Architecture

```
                          ┌─────────────────────────┐
                          │      User Browser        │
                          └────────────┬────────────┘
                                       │ HTTP
                                       ▼
                          ┌─────────────────────────┐
                          │  AWS ALB (Internet-Facing│
                          │  Application Load Balancer│
                          │  Managed by AWS LB Controller│
                          └────────────┬────────────┘
                                       │
                         Path-Based Routing (Ingress)
                                       │
         ┌─────────────────────────────┼──────────────────────────────┐
         │                             │                              │
         │        EKS Cluster: cinepass-dev (ap-south-2)             │
         │                             │                              │
         │   ┌─────────────────────────┼──────────────────────┐      │
         │   │         K8s Ingress (06-ingress.yaml)           │      │
         │   │                                                 │      │
         │   │  /               → frontend-service:80          │      │
         │   │  /api/auth       → auth-service:8080            │      │
         │   │  /api/catalog    → catalog-service:8081         │      │
         │   │  /api/bookings   → booking-service:8082         │      │
         │   │  /api/payments   → payment-service:8083         │      │
         │   │  /api/notifications → notification-service:8084 │      │
         │   └─────────────────────────────────────────────────┘      │
         │                                                             │
         │   ┌──────────┐  ┌──────────┐  ┌──────────┐               │
         │   │ frontend │  │   auth   │  │ catalog  │               │
         │   │ :80      │  │  :8080   │  │  :8081   │               │
         │   │ NGINX    │  │ Node.js  │  │ Node.js  │               │
         │   │ HTML/CSS │  │ JWT+RBAC │  │ Movies   │               │
         │   └──────────┘  └────┬─────┘  └────┬─────┘               │
         │                      │              │                      │
         │   ┌──────────┐  ┌────┘        ┌────┘                      │
         │   │ booking  │  │             │                            │
         │   │  :8082   │  │      ┌──────────────────────┐           │
         │   │ Node.js  │  │      │  AWS RDS PostgreSQL   │          │
         │   │ Redis    │  │      │  (Shared - SSL/TLS)   │          │
         │   │ Redlock  │  │      └──────────────────────┘           │
         │   └────┬─────┘  │                                          │
         │        │         │      ┌──────────────────────┐           │
         │   ┌────┘         │      │  AWS ElastiCache      │          │
         │   │              │      │  Redis (Seat Locks)   │          │
         │   ▼              │      └──────────────────────┘           │
         │  ┌──────────┐    │                                          │
         │  │ payment  │    │      ┌──────────────────────┐           │
         │  │  :8083   │    └─────►│  AWS SQS             │          │
         │  │ Node.js  │           │  (Async Events)       │          │
         │  └──────────┘           └──────────┬───────────┘           │
         │                                    │                        │
         │  ┌──────────────────────────────────▼───────────────────┐  │
         │  │           notification-service:8084                   │  │
         │  │        Async SQS consumer → Email + Ticket PDF        │  │
         │  └───────────────────────────────────────────────────────┘  │
         └─────────────────────────────────────────────────────────────┘
```

---

## 🧩 Microservices Breakdown

| Service | Port | Tech | Responsibility | DB |
|:--------|:-----|:-----|:--------------|:---|
| **frontend-service** | 80 | NGINX | Serves HTML/CSS/JS UI (CinePass web app) | — |
| **auth-service** | 8080 | Node.js + TypeScript | User register/login, JWT issuance, RBAC roles | RDS PostgreSQL |
| **catalog-service** | 8081 | Node.js + TypeScript | Movies, theaters, showtimes, CRUD | RDS PostgreSQL |
| **booking-service** | 8082 | Node.js + TypeScript | Seat hold (Redis Redlock), confirm, release | RDS + ElastiCache Redis |
| **payment-service** | 8083 | Node.js + TypeScript | Payment processing, ledger, idempotent ops | RDS PostgreSQL |
| **notification-service** | 8084 | Node.js + TypeScript | Async SQS consumer → email/ticket dispatch | AWS SQS |

---

## 🌐 How Routing Works (Request Journey)

```
Step 1 — Load the website:
  Browser → GET http://<ALB-URL>/
           → ALB Ingress matches "/"
           → frontend-service:80 (NGINX)
           → Serves index.html + style.css + app.js
           → CinePass UI loads in browser ✅

Step 2 — User clicks "Book Tickets":
  Browser → GET http://<ALB-URL>/api/catalog/movies
           → ALB Ingress matches "/api/catalog"
           → catalog-service:8081
           → Queries RDS PostgreSQL
           → Returns JSON movie list ✅

Step 3 — User selects seats:
  Browser → POST http://<ALB-URL>/api/bookings/hold
           → ALB Ingress matches "/api/bookings"
           → booking-service:8082
           → Sets 5-min Redis lock (Redlock)
           → Returns bookingId ✅

Step 4 — User pays:
  Browser → POST http://<ALB-URL>/api/payments/process
           → ALB Ingress matches "/api/payments"
           → payment-service:8083
           → Creates payment record
           → Publishes event to SQS ✅

Step 5 — Email ticket (async):
  SQS → notification-service:8084
       → Generates QR code ticket
       → Dispatches email (AWS SES) ✅
```

---

## ☁️ AWS Infrastructure (Terraform)

### Resources Provisioned

| Resource | Config | Purpose |
|:---------|:-------|:--------|
| **VPC** | `10.0.0.0/16`, 3 AZs | Network isolation |
| **Public Subnets** | 3x (one per AZ) | ALB, NAT Gateways |
| **Private Subnets** | 3x (one per AZ) | EKS worker nodes |
| **Database Subnets** | 3x (one per AZ) | RDS + ElastiCache |
| **EKS Cluster** | v1.31, `cinepass-dev` | Kubernetes control plane |
| **EKS Node Group** | Spot `t3.small`, min=1 max=3 | Worker nodes |
| **RDS PostgreSQL** | `db.t3.micro`, SSL enabled | Persistent data store |
| **ElastiCache Redis** | `cache.t3.micro` | Seat locking (Redlock) |
| **ECR Repositories** | 5 repos (`force_delete=true`) | Docker image registry |
| **IAM OIDC Role** | `github-actions-eks-role` | CI/CD keyless auth |

### Terraform Modules

```
infrastructure/terraform/
├── modules/
│   ├── vpc/          # VPC, subnets, IGW, NAT, route tables
│   ├── eks/          # EKS cluster + managed node groups
│   ├── ecr/          # ECR repos (force_delete=true)
│   ├── rds/          # PostgreSQL RDS instance + subnet group
│   ├── elasticache/  # Redis cluster + subnet group
│   └── iam/          # GitHub Actions OIDC role + trust policy
└── env/dev/
    ├── main.tf       # Module wiring
    ├── variables.tf  # Input variables
    └── terraform.tfvars  # Dev environment values
```

---

## 🚀 CI/CD Pipeline (GitHub Actions + OIDC)

```
git push → GitHub Actions triggered
               │
               ├── 1. AWS OIDC auth (NO long-lived keys stored!)
               │       └── GitHub requests short-lived token from AWS IAM
               │
               ├── 2. Docker Build
               │       └── docker build -t <service> .
               │
               ├── 3. Push to ECR
               │       └── docker push 304960798044.dkr.ecr.ap-south-2.amazonaws.com/cinepass/<service>:latest
               │
               ├── 4. kubectl apply
               │       └── Rolls out new pod version to EKS cluster
               │
               └── 5. Step Summary
                       └── Direct URL + port-forward instructions posted in Actions UI
```

### Workflows

| Workflow File | Service | Trigger |
|:-------------|:--------|:--------|
| `auth-service.yml` | auth-service | push to `services/auth-service/**` |
| `catalog-service.yml` | catalog-service | push to `services/catalog-service/**` |
| `booking-service.yml` | booking-service | push to `services/booking-service/**` |
| `payment-service.yml` | payment-service | push to `services/payment-service/**` |
| `notification-service.yml` | notification-service | push to `services/notification-service/**` |

### Why OIDC (No AWS Keys)?
- GitHub Actions requests a **short-lived JWT token** (15 min TTL) from AWS
- AWS IAM validates GitHub's OIDC provider signature
- IAM Role assumed: `arn:aws:iam::304960798044:role/github-actions-eks-role`
- **Zero secrets stored in GitHub** — no `AWS_ACCESS_KEY_ID` or `AWS_SECRET_ACCESS_KEY`

---

## 📁 Project Structure

```
movie-ticketing-microservices/
├── .github/workflows/           # CI/CD pipelines (one per service)
│   ├── auth-service.yml
│   ├── catalog-service.yml
│   ├── booking-service.yml
│   ├── payment-service.yml
│   └── notification-service.yml
│
├── services/
│   ├── auth-service/            # Node.js + TypeScript
│   │   ├── Dockerfile
│   │   └── src/
│   │       ├── controllers/auth.controller.ts
│   │       ├── routes/auth.routes.ts          # POST /register, POST /login, GET /me
│   │       ├── middleware/auth.middleware.ts   # JWT verify + RBAC
│   │       └── config/db.ts                   # RDS SSL connection pool
│   │
│   ├── catalog-service/         # Node.js + TypeScript
│   │   ├── Dockerfile
│   │   └── src/
│   │       ├── controllers/catalog.controller.ts
│   │       └── routes/catalog.routes.ts       # GET /movies, GET /theaters, GET /shows
│   │
│   ├── booking-service/         # Node.js + TypeScript
│   │   ├── Dockerfile
│   │   └── src/
│   │       ├── controllers/booking.controller.ts
│   │       └── routes/booking.routes.ts       # POST /hold, POST /:id/confirm, POST /:id/release
│   │
│   ├── payment-service/         # Node.js + TypeScript
│   │   ├── Dockerfile
│   │   └── src/
│   │       ├── controllers/payment.controller.ts
│   │       └── routes/payment.routes.ts       # POST /process, GET /:id
│   │
│   ├── notification-service/    # Node.js + TypeScript
│   │   ├── Dockerfile
│   │   └── src/                               # SQS consumer, email dispatch
│   │
│   └── frontend/                # Static web app (NGINX)
│       ├── index.html           # CinePass UI
│       ├── style.css            # Dark theme, glassmorphism
│       └── app.js               # API calls to /api/* endpoints
│
├── k8s/manifests/               # Kubernetes manifests
│   ├── 00-namespace.yaml        # cinepass-dev namespace
│   ├── 01-configmap.yaml        # Service env vars
│   ├── 01-secret.yaml           # DB passwords (from AWS Secrets Manager)
│   ├── 02-catalog-service.yaml  # Deployment + Service
│   ├── 03-booking-service.yaml  # Deployment + Service
│   ├── 04-payment-service.yaml  # Deployment + Service
│   ├── 05-notification-service.yaml
│   ├── 06-ingress.yaml          # ALB path-based routing (THE traffic router)
│   ├── 07-frontend-service.yaml # NGINX deployment + Service + nginx.conf
│   └── 07-frontend-configmap.yaml  # HTML/CSS/JS as ConfigMap
│
└── infrastructure/terraform/
    ├── modules/                 # Reusable Terraform modules
    │   ├── vpc/
    │   ├── eks/
    │   ├── ecr/                 # force_delete=true ✅
    │   ├── rds/
    │   ├── elasticache/
    │   └── iam/                 # GitHub OIDC trust policy
    └── env/dev/
        ├── main.tf
        ├── variables.tf
        └── terraform.tfvars
```

---

## 🔑 Key Design Decisions

### 1. Seat Locking with Redis Redlock
```
User selects seat A3
  → booking-service: SET seat:showId:A3 bookingId EX 300 NX
  → Redis acquires distributed lock (300s TTL)
  → Other users see A3 as "locked" (yellow)
  → Payment completes → lock promoted to "booked" in RDS
  → Payment fails/timeout → lock auto-expires → seat released
```

### 2. OIDC Trust Policy (No Static Credentials)
```json
"Condition": {
  "StringLike": {
    "token.actions.githubusercontent.com:sub": "repo:*movie-ticketing-microservices*:*"
  }
}
```
Wildcard used because GitHub OIDC injects enhanced security claims with account/repo IDs into the `sub` field.

### 3. SSL for RDS
All services connect to RDS with:
```typescript
ssl: { rejectUnauthorized: false }  // AWS RDS managed cert
```

### 4. ECR Force Delete
```hcl
resource "aws_ecr_repository" "ecr_repository" {
  force_delete = true  # terraform destroy works even when images exist
}
```

### 5. Frontend — Same Domain, No CORS
Frontend is served at `/` via the **same ALB URL** as all `/api/*` routes.  
This means **zero CORS issues** — browser treats all requests as same-origin.

---

## 🌍 API Reference

### Auth Service — `/api/auth`
| Method | Path | Description |
|:-------|:-----|:------------|
| POST | `/api/auth/register` | Create new user account |
| POST | `/api/auth/login` | Login, returns JWT token |
| GET | `/api/auth/me` | Get current user profile (JWT required) |
| GET | `/api/auth/admin/verify-access` | Verify THEATER_ADMIN role |
| GET | `/api/auth/health` | Health check |

### Catalog Service — `/api/catalog`
| Method | Path | Description |
|:-------|:-----|:------------|
| GET | `/api/catalog/movies` | List all movies |
| GET | `/api/catalog/movies/:id` | Get single movie |
| GET | `/api/catalog/theaters` | List theaters |
| GET | `/api/catalog/shows` | List showtimes |
| POST | `/api/catalog/movies` | Add movie (admin) |
| GET | `/api/catalog/health` | Health check |

### Booking Service — `/api/bookings`
| Method | Path | Description |
|:-------|:-----|:------------|
| POST | `/api/bookings/hold` | Hold seats (Redis lock, 5 min TTL) |
| GET | `/api/bookings/show/:showId/seats` | Get seat map for a show |
| POST | `/api/bookings/:id/confirm` | Confirm booking after payment |
| POST | `/api/bookings/:id/release` | Release held seats |
| GET | `/api/bookings/health` | Health check |

### Payment Service — `/api/payments`
| Method | Path | Description |
|:-------|:-----|:------------|
| POST | `/api/payments/process` | Process payment |
| GET | `/api/payments/:paymentId` | Get payment details |
| GET | `/api/payments/booking/:bookingId` | Get payment by booking |
| POST | `/api/payments/webhook` | Payment gateway webhook |
| GET | `/api/payments/health` | Health check |

---

## 🛠️ Local Development & Deployment

### Prerequisites
- AWS CLI configured (`aws configure`)
- kubectl + Terraform installed
- Docker Desktop running

### Deploy Infrastructure
```bash
cd infrastructure/terraform/env/dev
terraform init
terraform plan
terraform apply -auto-approve
```

### Deploy to EKS (after infra up)
```bash
aws eks update-kubeconfig --region ap-south-2 --name cinepass-dev
kubectl apply -f k8s/manifests/
```

### Access the UI
```bash
# Get ALB URL
kubectl get ingress -n cinepass-dev

# Or port-forward frontend directly
kubectl port-forward svc/frontend-service 8080:80 -n cinepass-dev
# Open: http://localhost:8080
```

### Destroy Everything (Clean Infra)
```bash
cd infrastructure/terraform/env/dev
terraform destroy -auto-approve
# Note: ECR repos have force_delete=true — no manual cleanup needed
```

---

## 💰 AWS Cost (Dev Environment)

| Resource | Type | Est. Monthly Cost |
|:---------|:-----|:-----------------|
| EKS Control Plane | Managed | ~$72 |
| EC2 (Spot t3.small x2) | Worker Nodes | ~$5-10 |
| RDS PostgreSQL | db.t3.micro | ~$15 |
| ElastiCache Redis | cache.t3.micro | ~$12 |
| ALB | Per hour + LCU | ~$5-10 |
| ECR | Per GB stored | ~$1 |
| **Total** | | **~$110-120/month** |

> 💡 **Tip**: Run `terraform destroy` after demos to stop all charges!

---

## 🏗️ Built By

**Pavan Sai Pashikanti** — AWS EKS Microservices Project  
Stack: `TypeScript` · `Node.js` · `PostgreSQL` · `Redis` · `AWS EKS` · `Terraform` · `GitHub Actions` · `Kubernetes` · `Docker`

---

*© 2026 CinePass Enterprise. Cloud-Native Cinema Ticketing at Scale.*
