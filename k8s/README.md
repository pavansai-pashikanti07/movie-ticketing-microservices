# ☸️ Kubernetes & Helm Directory (`k8s/`)

This directory contains the **Helm Charts** and **Kubernetes manifests** used to deploy, configure, and autoscale CinePass microservices on **AWS EKS**.

---

## 1. Why Helm instead of Plain YAML Files?

In a microservices architecture with 5+ independent services:
- Managing raw YAML (`deployment.yaml`, `service.yaml`, `ingress.yaml`, `hpa.yaml`) for each service creates **dozens of duplicated files**.
- **Helm solves this with templates and values**:
  - One generic microservice chart template.
  - Separate `values.yaml` files for each service (`values-auth.yaml`, `values-booking.yaml`, etc.).
  - Enables single-command rollbacks: `helm rollback cinepass 2`.

---

## 2. Key Cloud-Native Kubernetes Features Configured

### 1. Ingress & AWS Load Balancer Controller
- We define a single Kubernetes `Ingress` object:
  ```yaml
  apiVersion: networking.k8s.io/v1
  kind: Ingress
  metadata:
    name: cinepass-ingress
    annotations:
      kubernetes.io/ingress.class: alb
      alb.ingress.kubernetes.io/scheme: internet-facing
      alb.ingress.kubernetes.io/target-type: ip
      alb.ingress.kubernetes.io/listen-ports: '[{"HTTP": 80}, {"HTTPS": 443}]'
      alb.ingress.kubernetes.io/certificate-arn: arn:aws:acm:ap-south-2:...
  ```
- **What happens behind the scenes**:
  - The **AWS Load Balancer Controller** running on EKS listens for this Ingress.
  - It automatically provisions an AWS Application Load Balancer in AWS VPC.
  - It routes `/api/movies/*` to `catalog-service` and `/api/bookings/*` to `booking-service` directly to the pod IP addresses.

### 2. Horizontal Pod Autoscaler (HPA)
- Automatically scales pod replicas based on CPU/Memory and custom metrics:
  - `booking-service`: Min replicas = 3, Max replicas = 50 (scales up when CPU > 70%).
  - `catalog-service`: Min replicas = 2, Max replicas = 20.
  - Scale-down stabilization window (300s) prevents flapping during fluctuating traffic.

### 3. Liveness & Readiness Probes (Zero-Downtime Guarantee)
- **Readiness Probe (`/api/health`)**: Kubernetes does NOT send traffic to a new pod until it has successfully connected to Redis/PostgreSQL.
- **Liveness Probe (`/api/health`)**: If a pod deadlocks or runs out of memory, Kubernetes restarts the container automatically.

### 4. Zero Secrets in Git: AWS Secrets Store CSI Driver
- Pods pull database passwords and JWT secrets dynamically from **AWS Secrets Manager** and mount them into memory as files or environment variables.
- Secrets are NEVER stored in Git or plain Kubernetes Secret YAMLs!
