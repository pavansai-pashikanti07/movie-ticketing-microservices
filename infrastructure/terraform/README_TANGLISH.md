# 🎬 CinePass Cloud Infrastructure — Pure Tanglish Master Guide
### Mana Language Lo 11 AWS Cloud Modules & Architecture Complete Breakdown
**File Location**: `infrastructure/terraform/README_TANGLISH.md`

---

## 📑 Index of Services

1. [🌐 AWS VPC (Virtual Private Cloud)](#-1-aws-vpc-virtual-private-cloud)
2. [☸️ AWS EKS (Elastic Kubernetes Service)](#️-2-aws-eks-elastic-kubernetes-service)
3. [🐳 AWS ECR (Elastic Container Registry)](#-3-aws-ecr-elastic-container-registry)
4. [📬 AWS SQS (Simple Queue Service with DLQ)](#-4-aws-sqs-simple-queue-service-with-dlq)
5. [🗄️ AWS RDS PostgreSQL 16](#️-5-aws-rds-postgresql-16)
6. [🪣 Amazon S3 (Simple Storage Service)](#-6-amazon-s3-simple-storage-service)
7. [⚡ Amazon CloudFront (CDN)](#-7-amazon-cloudfront-cdn)
8. [🔐 AWS Secrets Manager](#-8-aws-secrets-manager)
9. [🏎️ AWS ElastiCache Redis](#️-9-aws-elasticache-redis)
10. [📢 Amazon SNS (Simple Notification Service)](#-10-amazon-sns-simple-notification-service)
11. [🔑 AWS IAM with OIDC & IRSA](#-11-aws-iam-with-oidc--irsa)
12. [🚫 Manam Vadani Services — Endhuku Vadale? Vadithe Ela Vadthunde?](#-12-manam-vadani-services--endhuku-vadale-vadithe-ela-vadthunde)

---

## 🌐 1. AWS VPC (Virtual Private Cloud)

### 1. Asalu aa service enti? (Real-Life Analogy)
VPC ante AWS cloud lo mana company kosam manam kattukune **oka pedda Gated Community compound wall**.
- Compound wall bayata public internet untundhi.
- Compound lopala manam illu (servers, databases) kattukuntam.
- Deentlo rendu types subnets untayi:
  - **Public Subnet**: Community Main Gate (ekkada Security Cabin / Load Balancer untundhi; bayata nunchi vache visitors ikkadiki ravochu).
  - **Private Subnet**: Community lo lopaliki unna private villas (ekkada mana DB, Redis, EKS servers untayi; bayata public internet nunchi direct ga evaru lopaliki raaleru).

### 2. Real-Life Examples:
- ICICI Bank or HDFC Bank lo branch counter public ga untundhi, kani main cash locker room lopala isolated ga untundhi. VPC lo private subnet ante aa cash locker room lanti area.

### 3. Mana App (CinePass) lo endhuku vadthunam?
- Mana **PostgreSQL Database** and **Redis Cache** ni direct public internet nunchi hide cheyadaniki. Internet hacker bots (Shodan, Port Scanners) direct ga connect avvakunda network-level barrier idhi.
- **High Availability (3 AZs)**: Hyderabad region (`ap-south-2`) lo **3 veru veru physical data centers (`ap-south-2a`, `2b`, `2c`)** lo split chesam. Okka data center lo flood vachina or power poyina, CinePass uninterrupted ga migilina 2 data centers lo run avthundhi.
- Subnets ki `kubernetes.io/role/elb = "1"` tags icham, deeni valla AWS Load Balancer Controller automatic ga public Ingress subnets ni kanipeduthundhi.

### 4. Andhulo unna main features:
- CIDR block customization (`10.0.0.0/16` gives 65,536 private IPs).
- Route Tables, Internet Gateways (IGW), NAT Gateways, Security Groups, Network ACLs.

### 5. Inka andhulo future lo em add cheyachu?
- **VPC Flow Logs**: VPC lo vache prathi packet IP ni CloudWatch or S3 lo store chesi security analysis cheyochu.
- **VPC Endpoints (AWS PrivateLink)**: S3, SQS, Secrets Manager ki internet vellakunda direct AWS internal fiber backbone dwara secure traffic pampadam.

### 6. Alternates em unnai & Manam endhuku vadale?
- *Default VPC*: AWS free ga create chesi isthundhi, kani andulo prathi machine ki public IP untundhi. Security standards ki pedda bokka. Reject chesam.
- *Multi-AZ NAT Gateways*: 3 AZs ki 3 NAT Gateways pedithe month ki **~$100 (₹8,300)** idle charges padathayi. Dev environment lo dabbu waste avvakunda NAT disable chesam (`enable_nat_gateway = false`).

### 7. Vadithe ela vadthunde?
- Production environment lo `enable_nat_gateway = true` and `single_nat_gateway = false` pedithe, 3 AZs lo 3 high-availability NAT Gateways automatic ga spin up avthayi.

---

## ☸️ 2. AWS EKS (Elastic Kubernetes Service)

### 1. Asalu aa service enti? (Real-Life Analogy)
EKS ante oka pedda **Airport Air Traffic Controller & Ground Staff Management System**.
- Mana flight runway meeda 100 flights (containers/pods) unte, e flight eppudu take-off avvali, landing ekkada jaragali, engine fail ayithe ventane backup flight ela pampali anedhi manage chesthadhi.
- Kubernetes master plane (etcd, api-server, scheduler) ni AWS manage chesthadhi. Manam kevalam worker nodes (EC2 machines) chuskunte chalu.

### 2. Real-Life Examples:
- Swiggy, Zomato, BookMyShow, Netflix motham Kubernetes meedhe run avthayi. Lunch time lo orders peragagane automatic ga servers double avthayi.

### 3. Mana App (CinePass) lo endhuku vadthunam?
- Mana 5 microservices (`auth`, `catalog`, `booking`, `payment`, `notification`) ni orchestrate cheyadaniki.
- **Self-Healing**: Okavela memory leak valla `booking-service` pod crash ayithe, EKS 500 milliseconds lo kotha pod create chesthadhi.
- **Horizontal Pod Autoscaling (HPA)**: *Pushpa 2* or *Kalki* tickets open ayinappudu CPU 70% cross avvagane pods ni 2 nunchi 40 pods ki seconds lo scale chesthadhi.
- **Zero-Downtime Rolling Updates**: Kotha software version deploy chesinappudu patha pods okkokkati replace avthayi, users ki 1 second kuda app aagipodhu.

### 4. Andhulo unna main features:
- Managed Node Groups, Spot Instance support, EKS Access Entries (modern IAM integration), CoreDNS, Kube-Proxy, VPC-CNI.

### 5. Inka andhulo future lo em add cheyachu?
- **Karpenter**: Standard Cluster Autoscaler badhulu Karpenter install chesthe, pod pending lo unna 10 seconds lo right-sized EC2 machine ni create chesthadhi.
- **KEDA (Kubernetes Event-driven Autoscaling)**: SQS queue lo messages perigithe notification pods ni scale chese smart controller.

### 6. Alternates em unnai & Manam endhuku vadale?
- *Plain EC2 (Monolith)*: Auto-healing undadhu, scaling chala slow (5 mins paduthundhi), blue-green deployments manual ga cheyali.
- *AWS ECS*: Proprietary tool, Helm charts run avvavu, cloud portability undadhu.
- *EKS Fargate*: Serverless pods, kani 25-30% cost ekkuva and Spot discounts support cheyadhu.
- *Spot Instances (`capacity_type = "SPOT"`, `t3.medium`)*: Manam Spot vadam kabatti normal price lo **70% to 80% discount (~₹1/hr)** vasthundhi!

### 7. Vadithe ela vadthunde?
- Okavela Fargate vadithe, worker nodes EC2 lekunda serverless ga pod per pod memory pay chesthu vadatharu.

---

## 🐳 3. AWS ECR (Elastic Container Registry)

### 1. Asalu aa service enti? (Real-Life Analogy)
ECR ante mana Docker Container images ni securely daache **oka Private Digital Bank Locker / Warehouse**.
- Manam code build chesi Docker image (`cinepass/auth-service:v1`) tayaru cheyagane, daanni ECR lo upload chestham.
- EKS cluster kotha pod start chesinappudu, ECR nunchi aa image ni pull cheskuntundhi.

### 2. Real-Life Examples:
- Google Drive lo photos ni safe ga pettinattu, ECR lo containers ni pettukuntam.

### 3. Mana App (CinePass) lo endhuku vadthunam?
- Mana 5 microservices ki 5 private repos pettam.
- **Security Scan (`scan_on_push = true`)**: GitHub Actions nunchi image push avvagane, andulo security bugs (CVEs) unte ECR ventane scan chesi warning isthundhi.
- **Fast Pull Latency**: EKS cluster and ECR rendu `ap-south-2` (Hyderabad) loney undadam valla sub-second lo image download aypothundhi.
- **Lifecycle Policy**: Prathi build ki image save avthu pothe storage bill perigipothundhi. Andhuke **Keep only latest 10 images** rule petam. Pathavi automatic ga delete aypothayi (Free Tier 500MB lo safe).

### 4. Andhulo unna main features:
- KMS encryption at rest, IAM permission policies, image tag immutability, pull-through cache.

### 5. Inka andhulo future lo em add cheyachu?
- **Image Tag Immutability**: Production lo okasari `v1.0.0` push ayyaka, evaru daanni overwrite cheyakunda lock cheyadam.
- **AWS Inspector Integration**: Continuous vulnerability assessment for running containers.

### 6. Alternates em unnai & Manam endhuku vadale?
- *Docker Hub*: Anonymous pull limit (100 pulls per 6 hrs) untundhi. Auto-scaling time lo 20 pods scale ayithe Docker Hub rate limit valla `ImagePullBackOff` error tho cluster chachipothundhi.
- *ECR Public*: Free kani company secret source code internet ki expose aypothundhi and only `us-east-1` lo untundhi.

### 7. Vadithe ela vadthunde?
- Okavela Docker Hub vadithe, company paid team plan ($300/yr) theeskuni credentials ni Kubernetes imagePullSecrets lo config chesi vadatharu.

---

## 📬 4. AWS SQS (Simple Queue Service with DLQ)

### 1. Asalu aa service enti? (Real-Life Analogy)
SQS ante restaurant lo **Cash Counter ki Kitchen Chefs ki madhya unde Token Board / Receipt Spindle**.
- Cashier (payment-service) daggara nuvvu bill pay cheyagane, vadu receipt ichesi `"Next Customer please!"` ani pilichesthadu (5 milliseconds).
- Chef (notification-service) kitchen lo okkokka receipt theeskuni biryani pack chesi, raita petti, cover kattadam 5 minutes paduthundhi.
- Okavela Chef slow ayina or kitchen lo gas aypoyina, Cash counter aagipodhu! Receipts anni token line (Queue) lo safe ga untayi.

### 2. Real-Life Examples:
- IRCTC Tatkal booking time lo payment success avvagane ticket background lo generate avvadam.
- Amazon delivery tracking notifications.

### 3. Mana App (CinePass) lo endhuku vadthunam?
- **Checkout Speed (5ms)**: User ₹900 pay cheyagane, `payment-service` queue lo chinnadi JSON event vesi ventane `"Booking Confirmed!"` screen chupisthundhi.
- **Heavy Background Work**: Dynamic QR code render chesi, 2-page PDF boarding pass build chesi, email pampadam 3-5 seconds paduthundhi. Customer ni screen mundhu 5 seconds wait cheyisthe user experience worst avthundhi. SQS background worker ki work ichesthadhi.
- **Traffic Spikes Smoothing**: 50,000 users okesari tickets book chesthe, email server crash avvakunda SQS queue lo buffer aypothayi.
- **Dead-Letter Queue (DLQ)**: Invalid email address valla message 3 sarlu fail ayithe (`maxReceiveCount = 3`), main queue block avvakunda DLQ loki move aypothundhi (14 days safe ga untundhi).

### 4. Andhulo unna main features:
- Visibility Timeout (30s), Long Polling (`WaitTimeSeconds: 10`), Message Retention (4 days), DLQ Redrive Policy.
- **Free Tier**: First 1,000,000 messages every month 100% FREE!

### 5. Inka andhulo future lo em add cheyachu?
- **KEDA Auto-scaler**: SQS queue lo 100 messages kante ekkuva unte notification worker pods ni 1 nunchi 10 pods ki auto-scale cheyadam.
- **SNS-SQS Fanout**: Okke event ni simultaneously SMS worker ki and Email worker ki fan-out cheyadam.

### 6. Alternates em unnai & Manam endhuku vadale?
- *Apache Kafka (AWS MSK)*: Kafka continuous event streaming kosam super, kani minimum 3-node cluster ki **$150/month (₹12,500+)** minimum bill paduthundhi! Simple ticket queuing kosam antha costly overkill tool avasaram ledhu.
- *RabbitMQ (Amazon MQ)*: Server manage cheyali, patching manual, costly.
- *FIFO Queue*: 300 msgs/sec throughput limit untundhi. Standard queue virtually unlimited throughput isthundhi.

### 7. Vadithe ela vadthunde?
- Okavela Kafka vadithe, `movie-events` topic petti, partitions divide chesi, consumer groups tho real-time clickstream analytics run chestham.

---

## 🗄️ 5. AWS RDS PostgreSQL 16

### 1. Asalu aa service enti? (Real-Life Analogy)
Amazon RDS ante mana system ki **oka Certified Chartered Accountant & Bank Main Ledger**.
- Manam normal EC2 lo database pedithe backups, updates, security manual ga cheyali. RDS lo AWS automatic ga nightly backups theesthundhi, disk space peragagane auto-scale chesthadhi, and crash ayithe auto-restart chesthadhi.

### 2. Real-Life Examples:
- Banking ledgers, Stock exchanges, E-commerce accounting—ekkada financial integrity undalo akkada relational databases vadatharu.

### 3. Mana App (CinePass) lo endhuku vadthunam?
- **Financial ACID Compliance**: Movie ticket booking ante money transfer. Atomicity (ticket create avvali + payment charge avvali, renditlo edhi fail ayina rollback avvali). Consistency, Isolation, Durability mandatory.
- **Relational Tables**: Movies ➔ Theaters ➔ Auditoriums ➔ Shows ➔ Seats ➔ Bookings. Deleted show ki evaraina ticket book cheyadaniki try chesthe foreign keys reject chesthayi.
- **Security**: Port 5432 inbound strictly locked only to EKS worker nodes. Internet nunchi direct ga database ni evaru access cheyaleru (`publicly_accessible = false`).

### 4. Andhulo unna main features:
- Automated snapshots, storage auto-scaling up to 100GB, KMS encryption, DB Subnet Groups.
- **Cost**: `db.t3.micro` instance is **100% Free Tier (750 hours/month free)**.

### 5. Inka andhulo future lo em add cheyachu?
- **Read Replicas**: Heavy browsing traffic kosam Read-only replicas create chesi catalog queries ni primary DB nunchi offload cheyadam.
- **Multi-AZ Standby**: Production failover kosam secondary sync standby database enable cheyadam.

### 6. Alternates em unnai & Manam endhuku vadale?
- *DynamoDB (NoSQL)*: NoSQL lo multi-table joins undavu. Seats availability complex queries run cheyadam chala kashtam and cost per operation perigipothundhi.
- *Aurora Serverless v2*: Auto-scaling super kani Free Tier ledhu! Minimum base cost $45 to $60/month paduthundhi.
- *Self-hosted Postgres on EC2*: Manual snapshots, backup recovery scripts manual, high availability setup hard.

### 7. Vadithe ela vadthunde?
- Okavela Aurora Serverless v2 vadithe, traffic periginappudu ACUs (Aurora Capacity Units) 0.5 nunchi 16 ACUs ki automatic ga scale avthundhi.

---

## 🪣 6. Amazon S3 (Simple Storage Service)

### 1. Asalu aa service enti? (Real-Life Analogy)
Amazon S3 ante cloud lo **oka Infinite Capacity Storage Locker / Vault**.
- Deentlo files ni objects ga store chestham. 
- 99.999999999% (11 9's) durability untundhi—ante nuvvu 10,000 files store chesthe 10,000 years lo okka file kuda corrupt avvadhu!

### 2. Real-Life Examples:
- Google Drive, Dropbox, Netflix media backdrops motham S3 lanti object storage loney untayi.

### 3. Mana App (CinePass) lo endhuku vadthunam?
- **High-Res 4K Movie Posters & Backdrops**: Movies images ni container filesystems lo pedithe Docker size gigabytes perigipothundhi. S3 lo upload chesi lightweight URLs vadatham.
- **Generated PDF Boarding Passes**: `notification-service` generate chesina ticket PDFs ni permanently store cheyadaniki.
- **Security**: 4 Public Access Blocks `true` chesam. Bucket ki direct public internet access 0%. Kevalam mana CloudFront CDN OAC dwara matrame access avthundhi.

### 4. Andhulo unna main features:
- S3 Versioning (accidental delete nunchi protection), SSE-S3 AES-256 encryption, Lifecycle rules.
- **Free Tier**: 5 GB standard storage completely free.

### 5. Inka andhulo future lo em add cheyachu?
- **S3 Lifecycle Rule to Glacier**: 60 days daatina patha ticket PDFs ni S3 Standard nunchi S3 Glacier Flexible Archive ki move chesi 90% storage cost tagginchadam.
- **CORS Configuration**: Direct browser file uploads (presigned URLs) allow cheyadam.

### 6. Alternates em unnai & Manam endhuku vadale?
- *Container Local Disk*: Container restart ayinappudu data permanent ga delete aypothundhi.
- *AWS EBS (Elastic Block Store)*: Single EC2 instance ke attach avthundhi, 10 pods share chesukoleru.
- *AWS EFS*: Multi-pod share avthundhi kani $0.30/GB (S3 kante 10x costly!).
- *S3 Glacier*: File retrieve cheyadaniki hours paduthundhi. Poster instant ga kanapadali kabatti S3 Standard vadam.

### 7. Vadithe ela vadthunde?
- Okavela EFS vadithe, PersistentVolumeClaim (PVC) create chesi pods ki shared network folder ga mount chestham.

---

## ⚡ 7. Amazon CloudFront (CDN)

### 1. Asalu aa service enti? (Real-Life Analogy)
CloudFront ante mana central warehouse nunchi prathi city lo pette **Local Area Distribution Branches / Express Delivery Hubs**.
- Central S3 bucket Hyderabad data center lo unna, user Mumbai, Bangalore, or London lo app open chesthe, CloudFront tana daggara unna closest Edge Location nunchi poster ni **5 milliseconds** lo deliver chesthadhi.

### 2. Real-Life Examples:
- YouTube video streaming buffer lekunda ravadaniki, Hotstar live matches fast ga ravadaniki CDNs vadatharu.

### 3. Mana App (CinePass) lo endhuku vadthunam?
- **Sub-10ms Poster Loading**: Catalog open cheyagane 50 posters instant ga flash aypothayi.
- **Cost Reduction**: 90%+ requests Edge cache nunchi serve avvadam valla S3 GET request bills and data egress charges zero aypothayi.
- **Origin Access Control (OAC)**: S3 bucket private ga untundhi. CloudFront SigV4 cryptographically signed request tho S3 nunchi file theeskuntundhi.

### 4. Andhulo unna main features:
- 450+ Edge locations, TLS/SSL termination at edge, Gzip & Brotli automated compression.
- **Free Tier**: **1 TB Data Transfer Out per month 100% FREE forever!**

### 5. Inka andhulo future lo em add cheyachu?
- **CloudFront Functions / Lambda@Edge**: Images ni on-the-fly WebP format loki resize cheyadam (Mobile screen ki chinnadi, Desktop ki 4K).
- **AWS WAF Integration**: Bot attacks, DDoS, and SQL injection blocking at the edge level.

### 6. Alternates em unnai & Manam endhuku vadale?
- *Direct S3 URLs*: S3 latency 100-200ms untundhi, and high egress data fees padathayi.
- *Legacy OAI (Origin Access Identity)*: Deprecated by AWS, modern KMS support undadhu.
- *Cloudflare / Fastly*: DNS bayata point cheyali, AWS native Terraform integration undadhu.

### 7. Vadithe ela vadthunde?
- Okavela Cloudflare vadithe, Route53 nameservers ni Cloudflare ki point chesi, orange cloud proxy dwara traffic route chestham.

---

## 🔐 8. AWS Secrets Manager

### 1. Asalu aa service enti? (Real-Life Analogy)
Secrets Manager ante mana system ki **oka High-Security Biometric Bank Safe / Vault**.
- Passwords ni diary lo rasi pettakunda (Git code lo hardcode cheyakunda), ee secure locker lo pedatham.
- Evaraina adigithe AWS STS check chesi, permission unte temporary ga password chupisthundhi.

### 2. Real-Life Examples:
- 1Password or LastPass lanti password manager systems for cloud applications.

### 3. Mana App (CinePass) lo endhuku vadthunam?
- `cinepass/dev/credentials` lo DB Password, JWT Secret, and DB Host store chesam.
- Git repository lo or Dockerfile lo 1 byte secret kuda plain-text lo undadhu.
- **External Secrets Operator (ESO)**: Kubernetes lo run ayye ESO operator IAM IRSA token tho AWS Secrets Manager ki velli, ee passwords theeskuni pods memory (`tmpfs`) loki secret ga inject chesthadhi.

### 4. Andhulo unna main features:
- AWS KMS encryption at rest, automatic secrets rotation, fine-grained IAM resource policies.

### 5. Inka andhulo future lo em add cheyachu?
- **Automated RDS Password Rotation**: Every 30 days ki Lambda function dwara database password automatic ga change ayye feature enable cheyadam.

### 6. Alternates em unnai & Manam endhuku vadale?
- *Git Hardcoding / .env in Git*: Hackers 30 seconds lo repo scan chesi passwords theeskuntaru. Disaster.
- *Plain Kubernetes Secrets*: Base64 string matrame, etcd lo unencrypted ga untundhi.
- *AWS SSM Parameter Store*: Standard strings free kani automated DB rotation undadhu.
- *HashiCorp Vault*: Enterprise tool kani separate cluster setup chesi unseal chesi maintain cheyali (high operational overhead).

### 7. Vadithe ela vadthunde?
- Okavela HashiCorp Vault vadithe, Vault Helm chart install chesi, Vault Agent Sidecar Injector dwara pod loki secret files mount chestham.

---

## 🏎️ 9. AWS ElastiCache Redis

### 1. Asalu aa service enti? (Real-Life Analogy)
ElastiCache Redis ante mana system ki **Lightning Fast Super RAM (In-Memory Engine)**.
- Hard disk (Postgres) daggara velladaniki time paduthundhi. Redis RAM lo untundhi kabatti sub-millisecond (0.5ms) lo data read and write chesthadhi.

### 2. Real-Life Examples:
- BookMyShow seat booking, IPL live scores counter, gaming leaderboards.

### 3. Mana App (CinePass) lo endhuku vadthunam?
- **High-Concurrency Seat Locking**: Blockbuster movie open ayinappudu okke seat ni 5,000 mandhi click chesthe Postgres DB crash aypothundhi.
- Redis lo atomic single-threaded command run chestham:
  ```bash
  SET lock:show:1:seat:A1 <userId> NX EX 300
  ```
  - `NX` = Evaru lock cheyakapothe matrame lock avvu.
  - `EX 300` = 5 minutes lo automatic ga expire aypo.
- **Sub-1ms Lock**: First user ki 0.8ms lo seat lock avthundhi. Migilina 4,999 users ki ventane `409 Conflict` ("Seat already held") vasthundhi.
- **Auto Release**: Customer payment cheyakunda app close chesthe, **5 minutes tharvatha Redis automatic ga lock delete chesi seat release chesthadhi** (Zero background cron jobs!).

### 4. Andhulo unna main features:
- Sub-millisecond latency, in-memory data structures (Hashes, Sets, Sorted Sets), key expiration TTL.
- **Cost**: `cache.t3.micro` is **100% Free Tier (750 hours/month free)**.

### 5. Inka andhulo future lo em add cheyachu?
- **Redis Pub/Sub for Live Seat Updates**: User seat select cheyagane, screen chusthunna migilina 1,000 users screen meeda WebSocket dwara aa seat automatic ga GREY (locked) aypoye live updates.
- **Cluster Mode Multi-AZ**: 3 shards setup for handling millions of concurrent users.

### 6. Alternates em unnai & Manam endhuku vadale?
- *Postgres `SELECT FOR UPDATE`*: DB connection pools choke aypoyi database chachipothundhi.
- *Memcached*: Simple key-value cache, kani atomic `SET NX` locks and data structures undavu.
- *DynamoDB TTL*: AWS official documentation lo undhi: **DynamoDB TTL deletion actual ga delete cheyadaniki up to 48 hours paduthundhi!** Ticketing app lo 5 minutes ki sharp ga seat release avvali, so DynamoDB unusable.

### 7. Vadithe ela vadthunde?
- Okavela Redis Pub/Sub vadithe, Socket.io gateway pods ki Redis adapter connect chesi frontend browsers ki live seat events broadcast chestham.

---

## 📢 10. Amazon SNS (Simple Notification Service)

### 1. Asalu aa service enti? (Real-Life Analogy)
SNS ante mana company **Loudspeaker / Emergency Sirens Broadcast System**.
- SQS lo okka worker matrame message theesukogaladhu (1-to-1).
- Kani SNS lo okka message trigger chesthe, adhi Email, SMS, Slack, PagerDuty anni chotla okesari distribute (Fan-Out 1-to-Many) aypothundhi.

### 2. Real-Life Examples:
- Fire alarm moginappudu building lo unna anni floors lo sirens okesari sound chesinattu.
- Bank OTP SMS dispatches.

### 3. Mana App (CinePass) lo endhuku vadthunam?
- **Site Reliability & CloudWatch Alarms**: Mana production app lo HTTP 5xx errors > 1% ayina, pod CrashLoopBackOff ayina, CloudWatch ventane `cinepass-dev-alerts` SNS topic ki alarm dispatch chesthadhi.
- SNS aa alert ni engineering email list and Slack channel ki sub-second lo pampisthundhi.

### 4. Andhulo unna main features:
- Fanout pattern, SMS, Email, HTTP/HTTPS webhooks, Lambda triggers.
- **Free Tier**: First 1,000,000 notifications per month 100% FREE!

### 5. Inka andhulo future lo em add cheyachu?
- **SNS to PagerDuty / Opsgenie**: Midnight production down ayithe on-call DevOps engineer phone ki automated call velle setup.
- **Customer SMS Alerts**: Transactional SMS via AWS SNS telephony routes.

### 6. Alternates em unnai & Manam endhuku vadale?
- *SQS*: 1-to-1 processing, broadcast cheyaledhu.
- *Amazon EventBridge*: Event routing filters baguntayi kani ~30ms latency untundhi and per-event cost untundhi. Simple system alerting ki SNS is instantaneous and free.

### 7. Vadithe ela vadthunde?
- Okavela EventBridge vadithe, content-based rules petti, severity `CRITICAL` ayithe SMS ki, severity `INFO` ayithe log bucket ki route chestham.

---

## 🔑 11. AWS IAM with OIDC & IRSA

### 1. Asalu aa service enti? (Real-Life Analogy)
IAM & IRSA ante mana high-security IT office lo **RFID Smart Access Card System**.
- Pods ki permanent AWS master keys ivvakunda (danger), pod ki oka temporary 1-hour digital visitor pass istham.
- Pass time aypogane automatic ga refresh aypothundhi.

### 2. Real-Life Examples:
- Office lo developer access card pantry and dev lab ki pani chesthadhi, kani server room or HR records room ki enter avvaledu (Least Privilege).

### 3. Mana App (CinePass) lo endhuku vadthunam?
- **Zero Static AWS Keys**: Mana code lo or Docker containers lo `AWS_ACCESS_KEY_ID` and `SECRET_KEY` hardcode cheyalsina avasaram ledhu.
- **Pod-Level Isolation**:
  - `notification-service` pod ki SQS read and S3 upload permissions untayi.
  - `auth-service` pod ki Secrets Manager read permission untundhi.
  - `catalog-service` pod ki zero AWS permissions untayi.
  - Okavela hacker catalog pod ni breach chesina, vadiki AWS lo 0% access untundhi!

### 4. Andhulo unna main features:
- `sts:AssumeRoleWithWebIdentity`, OIDC JWT validation, Least privilege boundary.
- **Cost**: 100% Free!

### 5. Inka andhulo future lo em add cheyachu?
- **AWS IAM Access Analyzer**: Unused permissions ni detect chesi automatic ga policy size tagginche security tool.

### 6. Alternates em unnai & Manam endhuku vadale?
- *Static Access Keys in Secrets*: Code leak ayithe hackers crypto-mining servers petti $20,000 bill vestaru.
- *EC2 Node Instance Profile*: Worker node ki admin role isthe, aa node paina run ayye anni pods ki aa permissions vachesthayi. Pod security break aypothundhi.

### 7. Vadithe ela vadthunde?
- Okavela Node Instance Profile vadithe, pod level lo kube-system add-ons disable chesi, host networking tho operate chestham (insecure).

---

## 🚫 12. Manam Vadani Services — Endhuku Vadale? Vadithe Ela Vadthunde?

| # | Service | Asalu Endhuku Vadaledhu? (Trade-offs & FinOps) | Okavela Vadithe Ela Vadthunde? |
| :---: | :--- | :--- | :--- |
| **1** | **Apache Kafka (AWS MSK)** | Minimum 3-broker cluster ki **$150/month (₹12,500+)** bill paduthundhi. Mana ticket notification buffering requirement ki SQS 100% free tier lo pani aypothundhi. | Real-time movie clickstream analytics, user browsing recommendation engine, and audit log streaming lo vadatharu. |
| **2** | **AWS DynamoDB** | DynamoDB lacks native relational foreign-key joins. Cinema catalog lo Theaters ➔ Shows ➔ Seats relational integrity kavali. And DynamoDB TTL item delete cheyadaniki up to 48 hours paduthundhi, making it useless for 5-min seat holds. | User profiles, movie reviews, and ratings lanti independent unstructured data kosam vadatharu. |
| **3** | **Aurora Serverless v2** | Auto-scaling super kani **Free Tier asalu ledhu**! Minimum base cost $45 to $60/month (~₹4,500/mo) paduthundhi. Standard RDS `db.t3.micro` is 100% Free Tier (750 hrs/mo). | Production high-scale traffic peaks lo auto-scaling database storage & compute kosam vadatharu. |
| **4** | **AWS Lambda (Serverless)** | Cold-start latency (1-3 seconds for VPC lambdas), 15-min execution limit, and high concurrency concurrency limits. Microservices containerized in EKS are predictable, sub-second, and portable. | PDF generation or image resizing cron jobs kosam isolated event-driven tasks lo vadatharu. |
| **5** | **AWS API Gateway** | Per-million request cost ($3.50/million) adds up quickly under heavy browsing traffic. Kubernetes NGINX Ingress / AWS ALB Ingress handles millions of requests at fixed node cost with lower latency. | Public mobile client authentication throttling and rate limiting at cloud perimeter lo vadatharu. |
| **6** | **AWS App Mesh / Istio** | Adds sidecar container to every pod, increasing RAM usage and CPU overhead. For 5 microservices, native Kubernetes internal DNS (`http://catalog-service:8081`) is 10x simpler, faster, and reliable. | 50+ microservices enterprise setup lo mTLS encryption and canary traffic splitting kosam vadatharu. |
| **7** | **AWS OpenSearch (Elasticsearch)** | Minimum managed cluster costs ~$35/month. Movie titles and theater searching can be handled easily with PostgreSQL `ILIKE` and trigram indexes at zero extra cost. | Millions of movie reviews, fuzzy spell-correction ("Pushpa" vs "Puspa"), and full-text search engine lo vadatharu. |
| **8** | **AWS WAF (Web Application Firewall)** | Costs $5/month per WebACL + $1/rule + $0.60/million requests. For dev/staging environment, application-level rate limiters and Helmet security headers are completely sufficient. | Production perimeter lo DDOS protection, SQL injection blocking, and Geo-blocking (blocking unauthorized countries) lo vadatharu. |
