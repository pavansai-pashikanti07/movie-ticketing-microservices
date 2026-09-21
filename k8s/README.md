# ☸️ CinePass Kubernetes & Helm Architecture (`k8s/`)

Enterprise Production-Grade Kubernetes Orchestration & Helm Packaging for the CinePass Movie Ticketing Platform.

---

## 📑 Directory Structure

```
k8s/
├── manifests/                    # Declarative K8s manifests (Kustomize ready)
│   ├── 00-namespace.yaml         # cinepass-dev namespace
│   ├── 01-auth-service.yaml      # Deployment + ClusterIP + IRSA ServiceAccount
│   ├── 02-catalog-service.yaml   # Deployment + ClusterIP
│   ├── 03-booking-service.yaml   # Deployment + ClusterIP + HPA (2 to 10 pods)
│   ├── 04-payment-service.yaml   # Deployment + ClusterIP + IRSA ServiceAccount
│   ├── 05-notification-service.yaml # Deployment + ClusterIP + IRSA ServiceAccount
│   ├── 06-ingress.yaml           # AWS ALB Ingress (Internet-Facing)
│   └── kustomization.yaml        # Kustomize manifest bundle
│
└── helm/
    └── cinepass/                 # Umbrella Helm 3 Chart
        ├── Chart.yaml            # Chart metadata (v1.0.0)
        ├── values.yaml           # Centralized configuration values
        └── templates/            # Helm Jinja-style Go templates
            ├── _helpers.tpl      # Standard labels & name helper
            ├── deployments.yaml  # All 5 microservices deployments
            ├── services.yaml     # ClusterIP services
            ├── ingress.yaml      # AWS ALB Ingress template
            ├── hpa.yaml          # HorizontalPodAutoscaler template
            ├── serviceaccounts.yaml # IRSA annotated service accounts
            └── external-secrets.yaml # AWS Secrets Manager operator sync
```

---

## 🚀 Quick Start Deployment

### Option 1: Using Kustomize / Kubectl (Immediate & Declarative)

```bash
# Preview generated manifests
kubectl kustomize k8s/manifests/

# Dry-run validation
kubectl apply --dry-run=client -k k8s/manifests/

# Deploy to active EKS cluster
kubectl apply -k k8s/manifests/
```

### Option 2: Using Helm 3 (Enterprise CI/CD Standard)

```bash
# Lint the Helm chart
helm lint k8s/helm/cinepass/

# Dry-run template generation
helm template cinepass k8s/helm/cinepass/ -n cinepass-dev

# Deploy or Upgrade release
helm upgrade --install cinepass k8s/helm/cinepass/ \
  --namespace cinepass-dev \
  --create-namespace \
  --values k8s/helm/cinepass/values.yaml
```

---

## 🌐 Ingress Routing Topology (AWS ALB Controller)

A single **AWS Application Load Balancer** is automatically provisioned via the AWS Load Balancer Controller in our public subnets. It routes traffic across our 5 microservices:

| External Path Pattern | Target Microservice | Internal Cluster Port | Key Responsibility |
| :--- | :--- | :---: | :--- |
| **`GET/POST /api/auth/*`** | `auth-service` | `8080` | User registration, JWT login, RBAC roles. |
| **`GET /api/catalog/*`** | `catalog-service` | `8081` | Movie posters, theater schedules, Redis caching. |
| **`POST /api/bookings/*`** | `booking-service` | `8082` | High-concurrency seat locking (`SET NX EX 300`). |
| **`POST /api/payments/*`** | `payment-service` | `8083` | Idempotent payments & SQS event emission. |
| **`GET /api/notifications/*`** | `notification-service` | `8084` | SQS consumer worker, PDF tickets & QR codes. |

---

## 📈 Horizontal Pod Autoscaling (HPA)

During blockbuster ticket sales (e.g. *Pushpa 2*, *Kalki*), `booking-service` scales automatically:

```yaml
minReplicas: 2
maxReplicas: 10
metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

- When booking traffic spikes and CPU exceeds 70%, Kubernetes spawns additional booking pods within 15 seconds.
- When traffic cools down, HPA scales pods back down to 2, keeping EC2 Spot costs minimal.

---

## 🔐 Zero-Trust Security & IRSA

All pods run with:
1. **`runAsNonRoot: true`** and `runAsUser: 1000` (CIS Benchmark Compliant).
2. **IRSA (IAM Roles for Service Accounts)**:
   - `auth-service-sa` assumes `cinepass-dev-external-secrets-role` to read Secrets Manager.
   - `payment-service-sa` and `notification-service-sa` assume `cinepass-dev-app-services-role` to publish and consume from SQS and upload to S3.
   - Zero static AWS keys stored anywhere in the cluster!
