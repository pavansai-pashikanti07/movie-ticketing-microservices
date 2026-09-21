# 🏛️ CinePass Cloud Infrastructure & Terraform Architecture
### Enterprise Production-Grade AWS Infrastructure for BookMyShow / Fandango Scale
**Validated with Terraform HCL (11 Modular Cloud Services in `ap-south-2`)**

---

## 📑 Master Architecture Index

This document is the ultimate technical deep-dive and interview study guide for all 11 AWS Cloud Modules provisioned under `infrastructure/terraform/`.

For each module, you will find:
1. **🔍 What is this service & How does it work?** (Core concept, real-world analogy, architecture mechanics)
2. **🎟️ Why do we use it in CinePass?** (Concrete movie ticketing problem it solves)
3. **📊 What other types/variants exist, and why were they rejected?** (Every AWS option evaluated, FinOps cost & architecture trade-offs)
4. **🧠 Telugu / Tanglish Mental Model** (Simple conceptual intuition)
5. **🎙️ How to Answer in an Interview (English Pitch)** (Exact word-for-word pitch for DevOps & Cloud Architect interviews)

---

## 🌐 1. AWS VPC (Multi-AZ High-Availability Network)

```
                       ┌────────────────────────────────────────────────────────┐
                       │          AWS Region: ap-south-2 (Hyderabad)            │
                       │             VPC CIDR: 10.0.0.0/16                      │
                       │                                                        │
 Internet Gateway (IGW)│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐│
         │             │  │ ap-south-2a  │   │ ap-south-2b  │   │ ap-south-2c  ││
         ▼             │  ├──────────────┤   ├──────────────┤   ├──────────────┤│
┌─────────────────┐    │  │Public Subnet │   │Public Subnet │   │Public Subnet ││
│ Public Traffic  │───►│  │10.0.1.0/24   │   │10.0.2.0/24   │   │10.0.3.0/24   ││
│ (ALB / Ingress) │    │  │(ALB, Ingress)│   │(ALB, Ingress)│   │(ALB, Ingress)││
└─────────────────┘    │  ├──────────────┤   ├──────────────┤   ├──────────────┤│
                       │  │Private Subnet│   │Private Subnet│   │Private Subnet││
                       │  │10.0.101.0/24 │   │10.0.102.0/24 │   │10.0.103.0/24 ││
                       │  │(EKS, RDS,    │   │(EKS, RDS,    │   │(EKS, RDS,    ││
                       │  │ Redis Nodes) │   │ Redis Nodes) │   │ Redis Nodes) ││
                       │  └──────────────┘   └──────────────┘   └──────────────┘│
                       └────────────────────────────────────────────────────────┘
```

### 1. What is it & How does it work?
Amazon Virtual Private Cloud (VPC) is an isolated private software-defined network (SDN) dedicated to your AWS account. It logically separates your compute, database, and caching instances from other AWS customers. 
- It uses CIDR IP blocks (e.g., `10.0.0.0/16` gives 65,536 private IP addresses).
- It is segmented into **Subnets** attached to physical data center facilities called **Availability Zones (AZs)**.
- **Route Tables** control where IP packets go:
  - Route to `0.0.0.0/0` -> Internet Gateway (`igw-xxx`) = **Public Subnet**.
  - Route to `0.0.0.0/0` -> NAT Gateway (`nat-xxx`) or local only = **Private Subnet**.

### 2. Why do we use it in CinePass?
- **Zero Public Exposure for Databases**: Our PostgreSQL database and Redis cluster must **never** have a public IP address. Putting them in private subnets guarantees they cannot be port-scanned or attacked from the open internet.
- **High Availability (99.99%)**: Spread across **3 physical AZs** (`ap-south-2a`, `ap-south-2b`, `ap-south-2c`). If lightning strikes an entire AWS building or a power substation fails, CinePass continues running seamlessly in the other 2 AZs.
- **Dynamic Kubernetes Ingress Integration**: Subnets are tagged with:
  - `kubernetes.io/role/elb = "1"`: The AWS Load Balancer Controller uses this tag to auto-discover where to place public Application Load Balancers (ALBs).
  - `kubernetes.io/role/internal-elb = "1"`: For private internal load balancers.

### 3. What other types exist, and why were they rejected?
- **Default VPC vs Custom VPC**:
  - *Default VPC*: AWS creates a default VPC with all public subnets. Rejected because all instances get public IPs by default, violating basic enterprise security standards.
  - *Custom VPC (Our Choice)*: Full control over CIDR blocks, subnet segregation, and routing policies.
- **Managed NAT Gateway vs Single NAT vs Free-Tier Direct Routing**:
  - *Multi-AZ NAT Gateways*: Recommended for high-scale production, but costs **$0.045/hr per AZ + $0.045/GB data processed** = ~$100/month (~₹8,300/mo) for 3 AZs just sitting idle!
  - *Single NAT Gateway*: Cheaper (~$32/mo), but creates a single point of failure across AZs.
  - *Our Dev FinOps Choice (`enable_nat_gateway = false`)*: For dev/staging, we route egress via Internet Gateway while securing EKS worker nodes using strict AWS Security Groups and Private Service Endpoints. This achieves production network topology at **₹0.00 idle cost**.
- **Transit Gateway vs VPC Peering vs Single VPC**:
  - *Transit Gateway*: Used for connecting 10+ corporate VPCs; rejected as massive over-engineering for a standalone microservices cluster.
  - *Single Dedicated 3-AZ VPC*: Optimal balance of isolation, performance, and simplicity.

### 4. 🧠 Telugu / Tanglish Mental Model
> *"VPC ante mana sontha gated community wall lanti boundary. Dhandlo Public subnets ante community main gate (visitors/users ravadaniki), Private subnets ante interior security houses (ekkada DB, Redis, EKS nodes untayi, bayata vallaki direct entry undadhu). 3 AZs endhukante okka area lo current poyina, migilina rendu areas lo system uninterrupted ga nadusthundhi."*

### 5. 🎙️ How to Answer in an Interview (English Pitch)
> *"We architected a custom 3-AZ VPC in `ap-south-2` adhering strictly to the AWS Well-Architected Framework. We segregated the network into public and private subnets across three availability zones to guarantee high availability and eliminate single points of failure. The subnets are tagged with `kubernetes.io/role/elb` to enable dynamic subnet discovery by the AWS Load Balancer Controller. To balance production parity with cloud economics in non-production, we parameterized NAT Gateways to false and enforced strict security group firewalls on node egress, eliminating over $32 per month in idle charges without compromising security."*

---

## ☸️ 2. AWS EKS (Elastic Kubernetes Service v1.31)

```
                   ┌──────────────────────────────────────────────────┐
                   │        AWS Managed Control Plane (EKS)           │
                   │     api-server, etcd, controller-manager         │
                   └────────────────────────┬─────────────────────────┘
                                            │ Cluster API
       ┌────────────────────────────────────┼────────────────────────────────────┐
       ▼                                    ▼                                    ▼
┌──────────────┐                     ┌──────────────┐                     ┌──────────────┐
│ ap-south-2a  │                     │ ap-south-2b  │                     │ ap-south-2c  │
│ Spot Node 1  │                     │ Spot Node 2  │                     │ Spot Node 3  │
│ (t3.medium)  │                     │ (t3.medium)  │                     │ (t3.medium)  │
├──────────────┤                     ├──────────────┤                     ├──────────────┤
│auth-pod      │                     │booking-pod-1 │                     │booking-pod-2 │
│catalog-pod   │                     │payment-pod   │                     │notif-worker  │
└──────────────┘                     └──────────────┘                     └──────────────┘
```

### 1. What is it & How does it work?
Amazon EKS is a managed Kubernetes control plane. Running self-hosted Kubernetes requires manually provisioning 3 master nodes, setting up etcd clusters, managing TLS certificates, and handling control plane upgrades. AWS EKS automates all of that with a 99.95% SLA. You only manage worker nodes where application pods run.

### 2. Why do we use it in CinePass?
- **Microservices Orchestration**: Coordinates our 5 microservices (`auth`, `catalog`, `booking`, `payment`, `notification`), managing health checks, zero-downtime rollouts, and internal DNS service discovery (`http://catalog-service:8081`).
- **Autonomous Self-Healing**: If a pod crashes due to an out-of-memory (OOM) error or bug, Kubernetes replaces it within 500 milliseconds without customer impact.
- **Horizontal Pod Autoscaling (HPA)**: When tickets open for a massive movie release (e.g., *Pushpa 2*, *Avengers*) and booking traffic surges 50x, HPA automatically scales `booking-service` from 2 pods to 40 pods in seconds based on CPU/memory metrics.

### 3. What other types exist, and why were they rejected?
- **EC2 Standalone (Monolith / Docker on EC2)**:
  - *Rejected*: Manual scaling, no automated pod rescheduling upon server crash, painful blue-green deployments, poor server resource utilization.
- **AWS ECS (Elastic Container Service)**:
  - *Pros*: Simpler than Kubernetes, deep AWS integration.
  - *Rejected*: Lacks Kubernetes industry-standard portability. ECS cannot run standard Helm charts, does not natively support External Secrets Operator or KEDA (Kubernetes Event-driven Autoscaling), and locks our deployment pipelines into AWS proprietary task definitions.
- **EKS Fargate vs EKS Managed Node Groups**:
  - *EKS Fargate*: Serverless pods, zero node management. **Rejected** because Fargate charges a 25-30% premium per vCPU/RAM, does not support DaemonSets (e.g., Datadog/Prometheus node agents), has slower cold-start times (30-60s), and cannot use Spot instance discounts.
- **On-Demand Nodes vs Spot Instances**:
  - *Our Choice (`capacity_type = "SPOT"`, `t3.medium`)*: Spot instances provide a **70% to 80% discount** off on-demand pricing (~₹1/hr vs ₹3.5/hr). EKS Managed Node Groups automatically handle the 2-minute Spot termination notice by cordoning and draining nodes cleanly.

### 4. 🧠 Telugu / Tanglish Mental Model
> *"EKS ante oka smart traffic controller lanti platform. 5 microservices ni manage chesthundhi. Okka pod crash ayithe ventane kothadhi spawn chesthadhi. Heavy traffic vachinappudu automatic ga pods ni 2 nundi 30 ki scale chesthadhi. Manam Spot instances vadam kabatti normal cost lo 70-80% dabbu aadapathundhi."*

### 5. 🎙️ How to Answer in an Interview (English Pitch)
> *"We chose Amazon EKS v1.31 over ECS and plain EC2 because our distributed microservices architecture demands cloud-agnostic portability, declarative Helm deployments, and advanced scaling via HPA and KEDA. We implemented EKS Managed Node Groups backed by EC2 Spot instances (`t3.medium`), which reduces our compute footprint costs by roughly 75%. To maintain reliability on Spot instances, we configured graceful node termination handlers and pod disruption budgets (PDBs) ensuring uninterrupted ticketing availability during node rebalances."*

---

## 🐳 3. AWS ECR (Elastic Container Registry)

```
 Developer / Git Commit
         │
         ▼
 ┌───────────────┐        Docker Push         ┌────────────────────────────────┐
 │ GitHub Action │ ─────────────────────────► │           AWS ECR              │
 │ CI/CD Pipeline│   (via OIDC Auth Token)    │  5 Private Repositories        │
 └───────────────┘                            │  ├── cinepass/auth-service     │
                                              │  ├── cinepass/catalog-service  │
                                              │  ├── cinepass/booking-service  │
                                              │  ├── cinepass/payment-service  │
                                              │  └── cinepass/notif-service    │
                                              ├────────────────────────────────┤
                                              │ 🛡️ Auto Vulnerability Scan     │
                                              │ ♻️ Lifecycle Rule: Keep Last 10│
                                              └───────────────┬────────────────┘
                                                              │ Docker Pull
                                                              ▼
                                                     ┌─────────────────┐
                                                     │ EKS Worker Node │
                                                     └─────────────────┘
```

### 1. What is it & How does it work?
Amazon ECR is a fully managed, highly available Docker container image registry. It stores, encrypts, and serves container images. When EKS spins up a pod, the worker node's kubelet pulls the Docker image from ECR using IAM permissions without needing hardcoded Docker login credentials.

### 2. Why do we use it in CinePass?
- **Dedicated Private Repositories**: 5 isolated repositories corresponding to our 5 services:
  `cinepass/auth-service`, `cinepass/catalog-service`, `cinepass/booking-service`, `cinepass/payment-service`, `cinepass/notification-service`.
- **Security & Vulnerability Scanning (`scan_on_push = true`)**: Every Docker image built and pushed by GitHub Actions is automatically scanned for CVE security vulnerabilities against the Common Vulnerabilities and Exposures database before reaching Kubernetes.
- **Fast Pull Latency**: Because ECR is hosted in the same AWS region (`ap-south-2`) as our EKS cluster, image pull latency takes milliseconds rather than seconds over the public internet, speeding up autoscaling.

### 3. What other types exist, and why were they rejected?
- **ECR Public vs ECR Private**:
  - *ECR Public*: Free public hosting, but anyone in the world can pull your proprietary company source code! Also restricted only to `us-east-1`. **Rejected**.
  - *ECR Private (Our Choice)*: Highly secure, encrypted at rest with AWS KMS, restricted to our VPC and IAM roles.
- **Docker Hub vs AWS ECR**:
  - *Docker Hub*: Imposes strict rate limits (100 anonymous pulls per 6 hours, or paid accounts). When EKS scales 20 pods simultaneously, Docker Hub rate limits will trigger `ImagePullBackOff` errors and crash production! ECR has zero rate limits inside AWS.
- **GitHub Packages (GHCR) vs AWS ECR**:
  - GHCR requires storing GitHub personal access tokens (PAT) inside Kubernetes Secrets. ECR uses native IAM roles (IRSA), eliminating all static credentials.
- **Storage Lifecycle Policy**:
  - Without lifecycle management, storing 100 Docker builds (each ~200 MB) would cost money and exceed the 500 MB Free Tier.
  - *Our Solution*: Added an automated lifecycle policy: **Keep only the latest 10 images** (`countNumber: 10`). Old untagged images are purged automatically.

### 4. 🧠 Telugu / Tanglish Mental Model
> *"ECR ante mana Docker images store cheskune secure bank vault. Docker Hub vadithe rate limit padathadhi, scaling time lo pods fail avthayi. ECR AWS loney untundhi kabatti ultra-fast ga pull avthundhi, prathi image push avvagane security bugs unte scan chesthadhi, and auto-cleanup tho latest 10 images unchi pathavi delete chesthadhi."*

### 5. 🎙️ How to Answer in an Interview (English Pitch)
> *"We provisioned 5 private ECR repositories using a parameterized Terraform module. We rejected Docker Hub to avoid external rate-limiting bottlenecks during burst autoscaling events. For container governance, we enabled `scan_on_push` to proactively intercept CVE vulnerabilities in our CI/CD pipeline. Furthermore, we enforced an automated ECR lifecycle policy retaining only the 10 most recent image tags, strictly preventing storage cost creep and staying well within the AWS Free Tier boundaries."*

---

## 📬 4. AWS SQS (Simple Queue Service with Dead-Letter Queue)

```
                                          ┌──────────────────────────────────────────────┐
                                          │        Amazon SQS (Standard Queue)           │
                                          │        "cinepass-dev-booking-queue"          │
                                          │                                              │
 ┌─────────────────┐  Push Event (5ms)    │  [Msg 1]  [Msg 2]  [Msg 3]  [Msg 4]          │
 │ payment-service │ ────────────────────►│                                              │
 └────────┬────────┘                      └──────────────────────┬───────────────────────┘
          │                                                      │
          ▼ Returns 200 OK                                       │ Poll & Process (3-5 sec)
 ┌─────────────────┐                                             ▼
 │ Customer Screen │                                    ┌──────────────────────┐
 │ "Booking Done!" │                                    │ notification-service │
 └─────────────────┘                                    │ - Generates PDF      │
                                                        │ - Creates QR Code    │
                                                        │ - Sends Email / SMS  │
                                                        └──────────┬───────────┘
                                                                   │
                                                Fails 3 Times?     │
                                                (Invalid Email)    ▼
                                          ┌──────────────────────────────────────────────┐
                                          │          Dead-Letter Queue (DLQ)             │
                                          │      "cinepass-dev-booking-queue-dlq"        │
                                          │          Retained for 14 days                │
                                          └──────────────────────────────────────────────┘
```

### 1. What is it & How does it work?
Amazon SQS is a distributed message queue. It allows software components to run asynchronously. Instead of Service A waiting for Service B to finish a slow task (synchronous HTTP), Service A dumps a message into SQS and goes back to serving users immediately.

Key SQS Concepts:
- **Visibility Timeout (30s)**: When a worker starts processing a message, SQS hides it from other workers for 30 seconds. If the worker succeeds, it deletes the message. If the worker crashes, the message reappears for another worker.
- **Message Retention (4 days / 14 days for DLQ)**: Messages remain safely persisted even if the consumer is completely down.
- **Long Polling (`ReceiveMessageWaitTimeSeconds = 10`)**: The worker keeps an open connection for up to 10 seconds waiting for messages, reducing empty responses and cutting AWS billing costs to zero.

### 2. Why do we use it in CinePass?
- **Decoupling Checkout Latency**: When a user pays ₹500, `payment-service` pushes a lightweight `{ "bookingId": 101, "email": "user@gmail.com" }` JSON event to SQS in **5 milliseconds** and displays `"Booking Confirmed!"` to the user.
- **Heavy Background Work**: Generating a 2-page PDF ticket with dynamic QR code barcodes, attaching it, and sending it via SMTP/SES takes **3 to 5 seconds**. Keeping the user waiting on checkout for 5 seconds leads to abandoned carts, double payments, and timeouts. SQS lets `notification-service` process tickets smoothly in the background.
- **Peak Load Buffering (Traffic Smoothing)**: If 50,000 tickets are booked in 2 minutes, the PDF generator will crash if hit with 50,000 concurrent HTTP requests. SQS buffers all 50,000 messages safely in queue memory, letting consumers process them at a steady rate.

### 3. What other types exist, and why were they rejected?
- **Standard Queue vs FIFO Queue**:
  - *FIFO Queue (First-In, First-Out)*: Guarantees strict ordering and exactly-once processing, but throughput is capped at 300 msgs/sec (without batching) and costs more.
  - *Standard Queue (Our Choice)*: Virtually unlimited throughput, sub-millisecond API latency, at-least-once delivery. For ticket notifications, receiving email #102 a fraction of a second before #101 is completely harmless.
- **AWS MSK (Managed Kafka) vs AWS SQS**:
  - *Apache Kafka / MSK*: Great for real-time streaming analytics, but requires a 3-broker cluster costing **minimum $150+/month** with severe operational complexity (partitions, consumer rebalances, disk sizing).
  - *SQS*: 100% Serverless, requires zero maintenance, and gives **1,000,000 requests per month 100% FREE**!
- **RabbitMQ (Amazon MQ) vs SQS**:
  - Amazon MQ requires dedicated virtual instances ($25/mo) and manual broker patching. SQS is truly serverless.
- **Dead-Letter Queue (DLQ) Redrive Policy (`maxReceiveCount = 3`)**:
  - If a customer entered a malformed email address that crashes the PDF parser, the message will fail continuously (known as a **Poison-Pill Message**).
  - After 3 failed attempts, SQS automatically moves it to `cinepass-dev-booking-queue-dlq` (retained for 14 days), unblocking the main queue and notifying the engineering team.

### 4. 🧠 Telugu / Tanglish Mental Model
> *"SQS ante restaurant lo kitchen token counter lanti buffer. Cashier (payment-service) daggara dabbu ivvagane token receipt ichesi customer ni pampistharu (5ms). Kitchen chefs (notification-service) tokens ni queue nundi okkokkati theeskuni food prepare chestharu (PDF & Email). Chef ki plate cheyadam radhu ani 3 sarlu fail ayithe (poison message), aa order ni పక్కన bin (DLQ) lo padesi migilina orders ni continue chestharu."*

### 5. 🎙️ How to Answer in an Interview (English Pitch)
> *"We implemented an asynchronous event-driven pattern using Amazon SQS Standard queues to decouple payment confirmation from ticket generation. This isolates user checkout latency to sub-100ms, while the `notification-service` consumes messages at its own pace to compile PDF tickets and render QR codes. We architected a Dead-Letter Queue with a redrive policy (`maxReceiveCount = 3`) to isolate poison-pill messages without crashing worker threads. We rejected Kafka in favor of SQS because our throughput requirements didn't justify the $150 monthly operational overhead of an MSK cluster when SQS provides sub-millisecond queuing within the 1-million free monthly tier."*

---

## 🗄️ 5. AWS RDS PostgreSQL 16 (Relational Database)

```
        EKS Worker Nodes (Private Subnets)
         │
         │ Inbound Port 5432 ONLY
         ▼
┌────────────────────────────────────────────────────────┐
│ Amazon RDS PostgreSQL 16 (Engine Version: 16.3)        │
│ Instance Class: db.t3.micro (Free Tier)                │
│                                                        │
│ ├── Relational Foreign Keys:                           │
│ │   Movies ──► Theaters ──► Shows ──► Bookings ──► Seats│
│ ├── Financial Ledger (ACID Compliant Transactions)     │
│ ├── Storage: 20 GB gp3 SSD (Encrypted with AWS KMS)    │
│ └── Isolated DB Subnet Group (publicly_accessible=false│
└────────────────────────────────────────────────────────┘
```

### 1. What is it & How does it work?
Amazon RDS is a managed relational database service. It handles hardware provisioning, OS installation, PostgreSQL software patching, automatic nightly backups, and failure detection. It runs inside an isolated DB Subnet Group across private subnets.

### 2. Why do we use it in CinePass?
- **Relational Integrity**: A movie booking domain is deeply relational:
  `Movies` -> `Theaters` -> `Auditoriums` -> `Showtimes` -> `Bookings` -> `Seats` -> `Payments`. Foreign keys prevent orphaned records (e.g., selling a seat for a show that was deleted).
- **Strict ACID Financial Transactions**:
  - **Atomicity**: Booking record created + Payment charged must both succeed together, or both rollback. No half-bookings.
  - **Consistency**: Cannot double-book or deduct negative wallet balances.
  - **Isolation**: Concurrent database transactions don't dirty-read each other.
  - **Durability**: Committed booking data is permanently persisted to disk storage.

### 3. What other types exist, and why were they rejected?
- **RDS PostgreSQL vs AWS DynamoDB (NoSQL)**:
  - *DynamoDB*: Outstanding for key-value lookups, but lacks native relational joins and foreign-key constraints. Running complex queries (e.g., "Find all VIP seats booked in Theater 3 for Show 5 between 6 PM and 9 PM") requires multiple expensive scans and application-level joins.
- **RDS PostgreSQL vs Aurora Serverless v2**:
  - *Aurora Serverless v2*: Superb auto-scaling relational database, but has **no Free Tier**. It has a minimum base cost of 0.5 ACU (~$45 to $60/month) even when sitting completely idle!
  - *RDS PostgreSQL (`db.t3.micro`)*: Fully covered under AWS Free Tier (**750 hours/month free for 12 months**), running production-grade PostgreSQL 16.
- **RDS vs Self-Hosted PostgreSQL on EC2**:
  - Running Postgres on an EC2 instance requires manual backup scripting, OS patching, disk volume management, and zero automated failover. RDS automates all database maintenance.
- **Security Group Isolation**:
  - `publicly_accessible = false` prevents any internet inbound route.
  - Inbound port 5432 is strictly whitelisted to `module.eks.node_security_group_id`. No other machine in AWS or the internet can reach the database.

### 4. 🧠 Telugu / Tanglish Mental Model
> *"RDS PostgreSQL ante mana system lo core account ledger. Movie ticket transactions lo dabbulu transfer avthayi kabatti ACID compliance chala mukhyam. NoSQL/DynamoDB vadithe relational tables joins undav. Aurora vadithe month ki ₹4,000 minimum bill vasthundhi. Adhe RDS db.t3.micro vadadam valla 750 hours Free Tier lo free ga vasthundhi and EKS nodes ki thappa internet lo evariki direct connection undadhu."*

### 5. 🎙️ How to Answer in an Interview (English Pitch)
> *"For our primary transactional data store, we selected Amazon RDS PostgreSQL 16 over DynamoDB because the movie ticketing domain requires strict relational integrity across theaters, shows, and seating manifests, backed by ACID guarantees for financial ledger consistency. We deployed it on a `db.t3.micro` instance in an isolated multi-AZ DB subnet group with public accessibility disabled. Network access on port 5432 is strictly governed by Security Group rules allowing traffic solely from our EKS worker nodes. This architecture fulfills high enterprise security standards while staying 100% free-tier compliant."*

---

## 🪣 6. Amazon S3 (Simple Storage Service)

```
 ┌──────────────────────┐              Upload
 │ notification-service │ ────────────────────────────────┐
 └──────────────────────┘                                 │
                                                          ▼
 ┌──────────────────────┐    Upload Movie Posters  ┌─────────────────────────────┐
 │ Catalog Admin Portal │ ────────────────────────►│ Amazon S3 Standard Bucket   │
 └──────────────────────┘                          │ "cinepass-assets-07784"     │
                                                   ├─────────────────────────────┤
                                                   │ 📁 /posters/*.webp (4K)     │
                                                   │ 📁 /tickets/*.pdf (Boarding)│
                                                   │ 📁 /qr-codes/*.png          │
                                                   ├─────────────────────────────┤
                                                   │ 🛡️ 4x Public Access Block   │
                                                   │ 🏷️ S3 Versioning Enabled    │
                                                   │ 🔒 SSE-S3 AES-256 Encrypted │
                                                   └──────────────┬──────────────┘
                                                                  │
                                            Restricted to OAC Only│ (No Direct HTTP)
                                                                  ▼
                                                      Amazon CloudFront CDN
```

### 1. What is it & How does it work?
Amazon S3 is a highly durable object storage service designed to store unstructured files (images, PDFs, videos). Data is stored as binary objects within buckets, offering 99.999999999% (11 9's) data durability by automatically replicating files across a minimum of 3 physical availability zones within the region.

### 2. Why do we use it in CinePass?
- **High-Res Media Storage**: Stores 4K movie posters, banner backdrops, theater seating SVG maps, and trailer clips.
- **Generated PDF Boarding Passes**: Stores completed movie ticket PDFs generated by `notification-service`.
- **Eliminates Docker Container Bloat**: Storing files inside Docker containers bloats container size, crashes memory, and loses data when pods restart. S3 provides stateless, scalable, infinite storage.

### 3. What other types exist, and why were they rejected?
- **S3 Storage Classes**:
  - *S3 Standard (Our Choice)*: Low latency and high throughput for frequently accessed movie posters and fresh ticket downloads.
  - *S3 Intelligent-Tiering*: Great when access patterns are unknown; rejected here because movie catalog assets are constantly browsed.
  - *S3 Glacier / Glacier Deep Archive*: Designed for archival with retrieval delays from minutes to hours. Completely unusable for instant poster viewing or ticket download!
- **S3 vs EBS (Elastic Block Store) vs EFS (Elastic File System)**:
  - *EBS*: Block storage attached to a single EC2 instance. Cannot be shared across 10 EKS pods spread across 3 AZs.
  - *EFS*: Multi-AZ network file system, but costs $0.30/GB (over 10x more expensive than S3) and is slower for static web asset serving.
- **Security Hardening**:
  - **S3 Versioning Enabled**: Protects against accidental deletion or malicious overwrite of production movie posters.
  - **All 4 Public Access Blocks Enabled (`true`)**: The bucket has zero public endpoints. The only entity permitted to read files is our Amazon CloudFront CDN via Origin Access Control (OAC).

### 4. 🧠 Telugu / Tanglish Mental Model
> *"S3 ante mana cloud Google Drive / Hard Disk lanti object store. Containers lopala images save chesthe pod restart avvagane delete aypothayi. Andhuke movie posters, ticket PDFs ni S3 lo pedatham. 11 9's durability untundhi, ante file eppatiki delete avvadhu. Security kosam bucket ni 100% private lock chesam, direct ga internet lo evaru chudaleru, kevalam CloudFront dwara matrame access avthundhi."*

### 5. 🎙️ How to Answer in an Interview (English Pitch)
> *"We utilized Amazon S3 Standard for durable object storage to decouple static media from our container filesystems. This stores high-res movie posters and generated PDF ticket artifacts. To adhere to cloud security best practices, we enabled S3 Versioning to mitigate accidental data loss and strictly enforced all four `block_public_access` flags. The bucket is entirely shielded from direct public internet reads; assets are accessible solely through Amazon CloudFront via signed SigV4 Origin Access Control (OAC) requests."*

---

## ⚡ 7. Amazon CloudFront (Edge Content Delivery Network)

```
 User in Mumbai / Hyderabad
         │
         │ Request Movie Poster (5ms)
         ▼
┌────────────────────────────────────────────────────────┐
│ Amazon CloudFront Edge Location (PoP)                  │
│ Cache Hit? ──► YES: Return Image in 5ms!               │
│ Cache Miss?──► NO: Forward SigV4 Signed Request to S3  │
│                using Origin Access Control (OAC)       │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
              Amazon S3 Private Bucket
```

### 1. What is it & How does it work?
Amazon CloudFront is a global Content Delivery Network (CDN) with over 450+ Points of Presence (PoPs) globally. When a user requests an image, the DNS routes the request to the geographically closest Edge Location. If the edge cache has the image, it returns it in 5 milliseconds. If not, it pulls it from S3, caches it locally, and serves it.

### 2. Why do we use it in CinePass?
- **Sub-10ms Browsing Latency**: Movie apps are visually intensive. When users scroll through 50 movie posters, CloudFront serves assets from regional edge nodes in Hyderabad, Bangalore, or Chennai, delivering near-instant page loads.
- **Cost Reduction (S3 Egress)**: Serving requests from CloudFront edge cache dramatically reduces S3 GET requests and AWS regional data transfer out costs.
- **Origin Protection via OAC**: CloudFront acts as a security shield. Users never know the actual S3 bucket name or URL.

### 3. What other types exist, and why were they rejected?
- **Origin Access Control (OAC) vs Legacy Origin Access Identity (OAI)**:
  - *OAI (Deprecated)*: Old AWS mechanism that did not support AWS KMS customer-managed encryption or dynamic HTTP methods.
  - *OAC (Our Choice)*: Uses modern AWS Signature Version 4 (SigV4) to sign every request between CloudFront and S3. S3 bucket policy explicitly allows reads **only if `aws:SourceArn` matches our specific CloudFront distribution ARN**.
- **CloudFront vs Cloudflare / Fastly**:
  - Third-party CDNs require managing DNS outside AWS and complex egress bandwidth contracts. CloudFront integrates natively with Terraform AWS providers and S3 with zero egress fees between S3 and CloudFront.
- **Price Classes**:
  - `PriceClass_All`: Uses every edge location globally, including expensive South America and Africa nodes.
  - `PriceClass_100` / `PriceClass_200`: Focuses on North America, Europe, and Asia (including India). Highly cost-effective for CinePass operations.
- **Free Tier Benefit**: AWS CloudFront includes **1 TB of data transfer out per month completely free forever**.

### 4. 🧠 Telugu / Tanglish Mental Model
> *"CloudFront ante mana local area branch office lanti CDN. S3 Hyderabad data center lo unna, user Mumbai lo unte, CloudFront Mumbai edge server nunchi poster ni 5ms lo pampisthundhi. Prathi sari S3 main warehouse daggara vellalsina avasaram ledhu. Deeni valla site rocket speed lo load avthundhi and AWS bill lo 1 TB free transfer vasthundhi."*

### 5. 🎙️ How to Answer in an Interview (English Pitch)
> *"To optimize client-side browsing speed and shield our storage origin, we fronted our S3 bucket with an Amazon CloudFront distribution using modern Origin Access Control (OAC). Requests between the edge location and S3 are signed via SigV4, ensuring the S3 bucket accepts traffic solely from our CloudFront distribution ARN. This offloads up to 95% of asset traffic from S3 to edge caches, delivering sub-10ms response times while remaining within the 1 TB free egress tier."*

---

## 🔐 8. AWS Secrets Manager (Enterprise Secrets Store)

```
                               ┌──────────────────────────────────────────────┐
                               │ AWS Secrets Manager (KMS Encrypted)          │
                               │ "cinepass/dev/credentials"                   │
                               │ {                                            │
                               │   "DB_PASSWORD": "PavanPassword123!",        │
                               │   "JWT_SECRET": "SuperSecureJWTToken...",    │
                               │   "DB_HOST": "rds.cinepass.internal",        │
                               │   "DB_NAME": "cinepass"                      │
                               │ }                                            │
                               └──────────────────────┬───────────────────────┘
                                                      │
                                                      │ IRSA Assumed Role
                                                      │ (sts:AssumeRoleWithWebIdentity)
                                                      ▼
                                       ┌─────────────────────────────┐
                                       │ External Secrets Operator   │
                                       │ (Running in EKS cluster)    │
                                       └──────────────┬──────────────┘
                                                      │ Syncs into Memory
                                                      ▼
                                       ┌─────────────────────────────┐
                                       │ Kubernetes Secret (tmpfs)   │
                                       │ Injected into Pod Env Vars  │
                                       └─────────────────────────────┘
```

### 1. What is it & How does it work?
AWS Secrets Manager is a secure key-value secrets store. It encrypts data at rest using AWS Key Management Service (KMS). It allows programmatic storage and automated rotation of database credentials, API tokens, and private keys.

### 2. Why do we use it in CinePass?
- **Centralized Secrets Management**: We store our database passwords, JWT signing tokens, and third-party payment gateway keys under `cinepass/dev/credentials`.
- **Zero Secrets in Git**: No developer ever commits passwords to GitHub repositories, Dockerfiles, or Kubernetes manifests.
- **External Secrets Operator (ESO) Integration**: An open-source Kubernetes operator runs inside EKS, assumes an IAM role via IRSA, fetches secrets from Secrets Manager, and injects them as Kubernetes native secrets directly into pod memory.

### 3. What other types exist, and why were they rejected?
- **AWS Systems Manager (SSM) Parameter Store vs Secrets Manager**:
  - *SSM Parameter Store*: Standard strings are free, but lacks automated database password rotation, and cross-account secrets synchronization is more complex.
  - *Secrets Manager (Our Choice)*: Native automated rotation support, built-in encryption lifecycle, and direct first-class compatibility with the Kubernetes External Secrets Operator.
- **Plain Kubernetes Secrets vs Secrets Manager**:
  - Plain Kubernetes secrets are merely Base64-encoded strings (not encrypted!) stored in etcd. If someone gets read access to the cluster etcd, all passwords are compromised. External Secrets Operator + AWS Secrets Manager ensures secrets are centrally encrypted in AWS KMS.
- **HashiCorp Vault vs AWS Secrets Manager**:
  - *HashiCorp Vault*: Outstanding enterprise tool, but requires hosting and maintaining a dedicated Vault cluster (consul/raft storage, unsealing keys, high availability). Secrets Manager is 100% serverless.

### 4. 🧠 Telugu / Tanglish Mental Model
> *"Secrets Manager ante mana cloud locker. Database passwords, JWT keys ni GitHub code lo rasi commit chesthe hackers hack chestharu. Andhuke vatini Secrets Manager lo lock chesi pedatham. Kubernetes lo unna External Secrets Operator temporary permissions tho velli ee passwords ni theeskuni pods ki memory lo pass chesthadhi. Git lo zero plain-text passwords untayi."*

### 5. 🎙️ How to Answer in an Interview (English Pitch)
> *"We adhere strictly to 12-Factor App and DevSecOps security standards by centralizing database credentials and JWT signing keys in AWS Secrets Manager under `cinepass/dev/credentials`. To synchronize these values securely into Kubernetes, we deployed the External Secrets Operator configured with an IAM Role for Service Accounts (IRSA). This mechanism dynamically maps AWS secrets into ephemeral in-memory Kubernetes Secret objects without ever storing unencrypted credentials in Git, Helm values, or container images."*

---

## 🏎️ 9. AWS ElastiCache Redis (In-Memory Seat Locking Engine)

```
 100,000 Users Click "Seat A1" at the same second!
                       │
                       ▼
 ┌────────────────────────────────────────────────────────┐
 │           Amazon ElastiCache for Redis 7.1             │
 │               Single Node: cache.t3.micro              │
 ├────────────────────────────────────────────────────────┤
 │ User 1 runs:                                           │
 │ SET seat:hyd:aud1:s1:A1 "user_101" NX EX 300           │
 │ ──► Result: OK (Lock Acquired in 0.8 milliseconds!)    │
 │                                                        │
 │ User 2 to 100,000 run same command:                    │
 │ ──► Result: NULL / False (Seat Already Locked!)        │
 ├────────────────────────────────────────────────────────┤
 │ ⏰ Automatic TTL Expiration: 300 Seconds (5 Minutes)    │
 │ ──► If User 1 closes browser, key deletes itself!      │
 │ ──► Seat unlocks with ZERO manual cron jobs!           │
 └────────────────────────────────────────────────────────┘
```

### 1. What is it & How does it work?
Amazon ElastiCache for Redis is an in-memory, key-value data store. Unlike traditional disk-based databases (Postgres, MySQL), Redis stores data in RAM, delivering operations in sub-millisecond latencies (0.5ms to 1ms).

### 2. Why do we use it in CinePass?
- **High-Contention Atomic Seat Locking**:
  When a blockbuster movie opens and 5,000 fans attempt to select the same corner seat simultaneously:
  - If handled in PostgreSQL with `SELECT ... FOR UPDATE`, it causes severe row locks, database connection pool exhaustion, and completely crashes the database.
  - Redis executes single-threaded atomic operations in RAM. The command:
    ```bash
    SET seat:show_42:A1 "user_99" NX EX 300
    ```
    - `NX` = Only set if the key does NOT already exist.
    - `EX 300` = Set an automatic expiration of 300 seconds (5 minutes).
  - The first user gets `OK` in **under 1 millisecond**. The remaining 4,999 users immediately receive `Seat Already Selected`.
- **Zero-Maintenance Automatic Seat Release**:
  If the customer closes their phone or abandons payment, the Redis TTL automatically deletes the key after 5 minutes, making the seat available again with **zero cron jobs, background workers, or manual cleanup logic**!

### 3. What other types exist, and why were they rejected?
- **Redis vs Memcached**:
  - *Memcached*: Simple multi-threaded memory cache, but lacks atomic operations (`SET NX`), persistent data structures (Hashes, Sorted Sets), and Pub/Sub capabilities.
  - *Redis (Our Choice)*: First-class support for atomic distributed locks and key-level TTLs.
- **Redis vs DynamoDB for Seat Locking**:
  - DynamoDB has a TTL feature, but AWS DynamoDB documentation clearly states that **DynamoDB TTL deletion can take up to 48 hours to actually remove expired items**! That is catastrophic for movie ticketing where a seat must unlock precisely after 5 minutes.
- **Cluster Mode Enabled vs Cluster Mode Disabled**:
  - *Cluster Mode Enabled*: Shards data across dozens of nodes. Necessary for millions of concurrent keys, but expensive.
  - *Single Node (`cache.t3.micro`)*: Fully covered under the **AWS Free Tier (750 hours/month)**, capable of handling over 20,000 operations per second, which easily satisfies our microservices throughput.

### 4. 🧠 Telugu / Tanglish Mental Model
> *"ElastiCache Redis ante mana high-speed RAM database. BookMyShow lo blockbuster movie tickets open avvagane okke seat ni vandha mandhi okesari click chestharu. Manam Postgres DB vadithe DB crash aypothadhi. Redis lo `SET NX EX 300` command vadithe, first click chesina okkadiki matrame seat lock avthundhi (0.5 millisecond lo). Okavela vadu 5 minutes lo pay cheyakunda app close chesthe, Redis automatic ga aa lock ni delete chesi seat ni vere vallaki release chesthadhi."*

### 5. 🎙️ How to Answer in an Interview (English Pitch)
> *"We decoupled high-contention seat reservations from our relational database using Amazon ElastiCache for Redis. To solve the concurrency race condition where thousands of users select the same seat simultaneously, `booking-service` issues an atomic `SET NX EX 300` command. This acquires a distributed lock in under a millisecond. We leverage native Redis key-level TTL expiration to enforce a strict 5-minute checkout window; if the user abandons payment, the lock automatically self-evicts without requiring background polling cron jobs or database table sweeps."*

---

## 📢 10. Amazon SNS (Simple Notification Service)

```
                 CloudWatch Alarms
        (HTTP 5xx > 1% / Pod CrashLoopBackOff)
                         │
                         │ Dispatches Alarm
                         ▼
        ┌──────────────────────────────────┐
        │ Amazon SNS Topic                 │
        │ "cinepass-dev-alerts"            │
        └────────────────┬─────────────────┘
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
┌─────────────────┐ ┌─────────────┐ ┌─────────────────┐
│ DevOps Email    │ │ Slack Webhook│ │ PagerDuty Alert │
│ (Engineering)   │ │ Channel     │ │ (On-Call Team)  │
└─────────────────┘ └─────────────┘ └─────────────────┘
```

### 1. What is it & How does it work?
Amazon SNS is a fully managed publisher/subscriber (pub/sub) messaging service. Publishers send a message to a topic once, and SNS instantly fans out that message to multiple subscribing endpoints (Email, SMS, HTTP webhooks, Lambda, or SQS queues).

### 2. Why do we use it in CinePass?
- **Critical System Alerting**: Destination target for AWS CloudWatch Alarms. If our microservice error rates exceed 1%, if database connection pools run dry, or if Kubernetes pods enter a `CrashLoopBackOff`, CloudWatch immediately fires an event to `cinepass-dev-alerts`.
- **Fanout Architecture**: The single alert is broadcasted simultaneously to engineering team email lists, Slack alerts channels, and pager escalations.

### 3. What other types exist, and why were they rejected?
- **SNS Standard vs SNS FIFO**:
  - *SNS FIFO*: Enforces strict message ordering and deduplication, but has lower throughput and higher cost.
  - *SNS Standard (Our Choice)*: Nearly unlimited throughput and best-effort ordering, which is ideal for operational monitoring alerts.
- **SNS vs SQS**:
  - *SQS*: 1-to-1 message queuing (one consumer picks up and deletes the message). Used for task processing.
  - *SNS*: 1-to-Many publish/subscribe (broadcasts the same message to 10 different subscribers).
- **Amazon EventBridge vs Amazon SNS**:
  - EventBridge is an enterprise event bus with complex schema registries and third-party SaaS connectors (e.g., Salesforce, Datadog), but adds per-event routing latency (~30ms) and extra cost. SNS provides direct sub-millisecond alerting at **zero base cost** within the **1,000,000 free monthly requests**.

### 4. 🧠 Telugu / Tanglish Mental Model
> *"SNS ante mana loudspeaker / broadcast announcement system lanti service. SQS lo okka worker matrame message theeskuntundhi. Kani SNS lo okkasari message vesthe, adhi email, Slack, SMS anni chotla okesari distribute (fan-out) avthundhi. System lo 500 server errors vachina, pods crash ayina CloudWatch ventane SNS dwara developers ki alert pampisthundhi."*

### 5. 🎙️ How to Answer in an Interview (English Pitch)
> *"We provisioned an Amazon SNS Standard topic (`cinepass-dev-alerts`) integrated with CloudWatch Alarms for proactive site reliability engineering. When synthetic health checks fail, HTTP 5xx error thresholds exceed 1%, or EKS nodes experience memory pressure, CloudWatch dispatches an alert payload to the SNS topic. SNS fans out this notification across our monitoring endpoints, including Slack webhooks and on-call engineer notifications, staying well within AWS's 1-million free monthly notification quota."*

---

## 🔑 11. AWS IAM with OIDC & IRSA (Zero-Secret Security Architecture)

```
   ┌─────────────────────────────────────────────────────────────┐
   │ Kubernetes Pod: "notification-service-pod"                  │
   │ ServiceAccount: "notification-service-sa"                   │
   │ Projected Token: /var/run/secrets/eks.amazonaws.com/token   │
   └──────────────────────────────┬──────────────────────────────┘
                                  │
                                  │ 1. Exchanges Signed JWT Token
                                  ▼
   ┌─────────────────────────────────────────────────────────────┐
   │ AWS STS (Security Token Service)                            │
   │ Validates token with EKS OIDC Identity Provider             │
   │ (OIDC Provider URL: oidc.eks.ap-south-2.amazonaws.com)      │
   └──────────────────────────────┬──────────────────────────────┘
                                  │
                                  │ 2. Issues Ephemeral STS Credentials
                                  ▼
   ┌─────────────────────────────────────────────────────────────┐
   │ Assumed IAM Role: "cinepass-dev-app-services-role"          │
   │ Attached Policy:                                            │
   │ - Allow sqs:ReceiveMessage on "cinepass-dev-booking-queue"  │
   │ - Allow s3:PutObject on "cinepass-assets-07784"             │
   │ 🔒 Temporary Credentials Auto-Rotated Every 1 Hour!         │
   └─────────────────────────────────────────────────────────────┘
```

### 1. What is it & How does it work?
AWS Identity and Access Management (IAM) controls authentication and authorization. For Kubernetes, AWS created **IAM Roles for Service Accounts (IRSA)** using an OpenID Connect (OIDC) identity provider. 
- Kubernetes mounts a signed JSON Web Token (JWT) into the pod.
- The AWS SDK inside the pod contacts AWS STS (`sts:AssumeRoleWithWebIdentity`).
- STS validates the JWT signature against the EKS OIDC provider and issues **temporary, auto-rotating 1-hour credentials**.

### 2. Why do we use it in CinePass?
- **Zero Static AWS Keys**: We never generate or store static `AWS_ACCESS_KEY_ID` or `AWS_SECRET_ACCESS_KEY` credentials in our code or containers.
- **Granular Least-Privilege Roles**:
  1. **ALB Controller Role**: Permitted only to manage Application Load Balancers and Target Groups.
  2. **External Secrets Role**: Permitted only to read secrets matching `arn:aws:secretsmanager:*:*:secret:cinepass/*`.
  3. **App Services Role**: Permitted only to pull from SQS and upload PDFs to our S3 assets bucket.
  4. **GitHub Actions CI/CD OIDC Role**: Permitted only to push container images to ECR and deploy Helm charts from our specific GitHub repo (`pavansai-pashikanti07/movie-ticketing-microservices`).

### 3. What other types exist, and why were they rejected?
- **Hardcoded AWS Access Keys in Pods**:
  - *Catastrophic Risk*: If a developer leaks an AWS access key to a public GitHub repository, automated bots scan it within 30 seconds, spin up crypto-mining EC2 instances, and rack up a $20,000 bill.
- **Node Instance Profiles (EC2 IAM Role)**:
  - Giving IAM permissions to the underlying EC2 worker node means **every single pod running on that node inherits those admin permissions**! If an attacker breaches the frontend catalog pod, they can compromise the backend database and SQS queues.
- **IRSA (IAM Roles for Service Accounts - Our Choice)**:
  - Pod-level isolation. Even if 10 pods share the same physical EC2 node, Pod A cannot access Pod B's IAM role.

### 4. How the 4 Terraform IAM Resources Connect:
```
┌───────────────────────────────────────┐
│ 1. data "aws_iam_policy_document"     │ ──► Trust Policy: Binds role to EKS OIDC Provider & ServiceAccount
└──────────────────┬────────────────────┘
                   ▼
┌───────────────────────────────────────┐
│ 2. resource "aws_iam_role"            │ ──► The Identity container assumed via STS WebIdentity
└──────────────────┬────────────────────┘
                   │
                   │  ┌──────────────────────────────────────────────────┐
                   └──┼─► 4. resource "aws_iam_role_policy_attachment"   │ ──► Binds Policy to Role
                      └──────────────────────────┬───────────────────────┘
                                                 ▲
┌───────────────────────────────────────┐        │
│ 3. resource "aws_iam_policy"          │ ───────┘ ──► Least-privilege actions (sqs:ReceiveMessage, etc.)
└───────────────────────────────────────┘
```

### 5. 🧠 Telugu / Tanglish Mental Model
> *"IAM & IRSA ante mana access card security system. Containers lo AWS Access Keys & Secret Keys hardcode chesthe code leak ayinappudu company nasanam aypothundhi. IRSA vadadam valla pod ki direct keys undavu. Pod start avvagane EKS OIDC identity token chupinchi AWS STS nundi 1 hour expiry unna temporary pass theeskuntundhi. Okka pod permission vere pod ki undadhu."*

### 6. 🎙️ How to Answer in an Interview (English Pitch)
> *"We implemented zero-trust container security by leveraging IAM Roles for Service Accounts (IRSA) backed by an EKS OpenID Connect (OIDC) federated identity provider. Rather than granting broad permissions to EC2 Node Instance Profiles or managing static AWS access keys, we bind individual Kubernetes ServiceAccounts to granular IAM roles using `sts:AssumeRoleWithWebIdentity` restricted by the `sub` claim. This guarantees pod-level isolation: our notification pods can access SQS and S3, while our catalog pods have zero cloud permissions, perfectly enforcing least-privilege access under SOC2 compliance."*

---

## 🏆 Comprehensive Architecture & FinOps Comparison Matrix

| # | Module | Core Technology | Free Tier / Cost Strategy | Rejected Alternatives & Why | Real-World CinePass Justification |
| :---: | :--- | :--- | :--- | :--- | :--- |
| **1** | **VPC** | 3 AZs (`ap-south-2`) | **₹0.00** (`enable_nat_gateway = false`) | • Default VPC (Insecure public subnets)<br>• Multi-NAT (~$100/mo idle cost) | Multi-AZ fault tolerance; DB & Redis isolated from public internet; ALB auto-discovery tags. |
| **2** | **EKS** | Kubernetes v1.31 | **Spot Instances (~₹1/hr, 75% off)** | • Standalone EC2 (No self-healing/HPA)<br>• ECS (Proprietary, no Helm/KEDA)<br>• Fargate (25% cost premium, no Spot) | Orchestrates 5 microservices; auto-scales booking pods from 2 to 50 during blockbuster releases. |
| **3** | **ECR** | 5 Private Repos | **Free Tier (500 MB)** | • Docker Hub (Strict rate limits kill scaling)<br>• ECR Public (Exposes proprietary code)<br>• GHCR (Requires static PAT tokens) | Private Docker registry; automated CVE security scans on push; lifecycle policy purges old images. |
| **4** | **SQS** | Standard + DLQ | **Free Tier (1M req/mo)** | • Apache Kafka / MSK (Min $150/mo cluster)<br>• RabbitMQ (Manual patching, instance cost)<br>• Synchronous HTTP (Checkout timeouts) | Decouples payment confirmation (5ms) from ticket PDF/QR generation (5s); DLQ isolates poison pills. |
| **5** | **RDS** | PostgreSQL 16 | **Free Tier (750 hrs/mo on `db.t3.micro`)** | • DynamoDB (Lacks relational joins/ACID keys)<br>• Aurora Serverless v2 (~$50/mo minimum)<br>• Self-hosted Postgres (Manual backups/updates) | Maintains strict ACID consistency for financial bookings; foreign keys link Theaters ➔ Shows ➔ Seats. |
| **6** | **S3** | Object Storage | **Free Tier (5 GB)** | • Container Local Storage (Data lost on restart)<br>• EBS Multi-Attach (Single AZ limitation)<br>• S3 Glacier (Retrieval takes hours) | Stores 4K movie posters and generated PDF tickets; versioning prevents accidental deletion. |
| **7** | **CloudFront**| Global Edge CDN | **Free Tier (1 TB/mo transfer out)** | • Direct S3 Access (High latency & S3 egress fees)<br>• Legacy OAI (Deprecated, lacks SigV4/KMS)<br>• Cloudflare (DNS fragmentation outside AWS) | Caches media at regional edge locations for sub-10ms browsing; OAC restricts direct S3 access. |
| **8** | **Secrets** | AWS Secrets Manager | Free Trial / ~$0.40/mo | • Git Hardcoding (Critical security breach)<br>• Plain K8s Secrets (Base64 only, unencrypted)<br>• HashiCorp Vault (Operational overhead) | Encrypts DB passwords and JWT signing keys; External Secrets Operator syncs values directly into RAM. |
| **9** | **Redis** | ElastiCache Redis 7.1 | **Free Tier (750 hrs/mo on `cache.t3.micro`)** | • Postgres `SELECT FOR UPDATE` (Crashes DB)<br>• Memcached (No atomic locks/TTL)<br>• DynamoDB TTL (Takes up to 48 hours to delete) | Sub-millisecond atomic seat locking (`SET NX EX 300`); auto-unlocks abandoned seats after 5 mins. |
| **10**| **SNS** | Alerting Topic | **Free Tier (1M req/mo)** | • SQS (Cannot fan out to multiple endpoints)<br>• EventBridge (Higher cost & routing latency) | Fans out CloudWatch 5xx error alarms and pod crash notifications to Slack channels and DevOps email. |
| **11**| **IAM** | OIDC & IRSA | **100% Free** | • Static Access Keys (High leak & credential theft risk)<br>• Node Instance Profiles (Overly permissive for all pods) | Pod-level least-privilege security; STS issues temporary 1-hour rotating tokens via WebIdentity. |

---

## 🛠️ Verification & Validation Commands

All 11 modules have been syntax-checked and validated with Terraform:

```bash
# Navigate to dev environment
cd infrastructure/terraform/env/dev

# Initialize providers and remote backend
terraform init

# Validate syntax and configuration integrity
terraform validate
# Output: Success! The configuration is valid.

# Dry-run infrastructure provisioning plan
terraform plan
```
