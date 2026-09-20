# ⚡ CI/CD Workflows Directory (`.github/workflows/`)

This directory contains **GitHub Actions CI/CD workflows** designed for cloud-native microservice builds and continuous deployment to AWS EKS.

---

## 1. Why GitHub Actions instead of Jenkins for Microservices?

| Feature | Jenkins (Traditional) | GitHub Actions (Cloud-Native) |
| :--- | :--- | :--- |
| **Server Maintenance** | Requires managing VM instances, OS patching, Java upgrades, plugin maintenance | **Serverless**: Zero server maintenance, fully managed GitHub runners |
| **Authentication with AWS** | Traditionally requires static IAM Access Keys or runner IAM profiles | **AWS OIDC (Zero Keys)**: Native OpenID Connect tokens, zero stored credentials |
| **Microservice Monorepo Filtering** | Requires complex groovy SCM triggers to detect which folder changed | Native `paths:` filter — builds **only** the microservice whose code was modified |
| **Scalability** | Agent queues saturate during multiple concurrent PR builds | Scales to dozens of parallel runner jobs simultaneously |
| **Security Secrets** | Central credentials store vulnerable to misconfiguration | Granular repository and environment secrets with short-lived JWT OIDC tokens |

---

## 2. The Core Security Mechanism: AWS IAM OIDC (OpenID Connect)

In our previous Jenkins setup, we injected AWS access keys or relied on the agent's host credentials. In this microservices architecture, we implement the **industry gold standard: AWS OIDC with GitHub Actions**.

### How AWS OIDC Works (Zero Static Secrets!):
```
[ GitHub Actions Job ]
        │
        ▼ 1. Requests OIDC JWT token from GitHub's OIDC Provider
[ GitHub OIDC Token ] (Includes repository: pavansai-pashikanti07/..., branch: main)
        │
        ▼ 2. Sends token to AWS Security Token Service (STS)
[ AWS STS: AssumeRoleWithWebIdentity ]
        │ (AWS verifies token signature against https://token.actions.githubusercontent.com)
        ▼ 3. Issues temporary 15-minute AWS credentials
[ Short-Lived AWS Session ] ──► Pushes Docker Image to AWS ECR & updates EKS!
```

**Benefits**:
- Zero `AWS_ACCESS_KEY_ID` or `AWS_SECRET_ACCESS_KEY` stored anywhere.
- No credential rotation headaches.
- Least privilege: The assumed role can only write to the specific ECR repositories matching CinePass microservices.

---

## 3. Workflow Architecture

### 1. Granular Microservice CI Pipelines:
Instead of building all 5 microservices on every git push, we use **Git Path Filters**:
```yaml
on:
  push:
    branches: [ main ]
    paths:
      - 'services/booking-service/**'
      - '.github/workflows/ci-booking-service.yaml'
```
- If a developer changes `services/booking-service/src/server.go`, **only** `ci-booking-service.yaml` triggers.
- `auth-service`, `catalog-service`, and `payment-service` pipelines remain idle, saving GitHub Actions build minutes and preventing redundant deployments!

### 2. Pipeline Stages:
1. **Lint & Security Scan**: Lints code and runs Trivy container vulnerability scanner.
2. **Docker Build (Multi-Stage Alpine)**: Builds lightweight, non-root image with buildkit cache.
3. **AWS ECR Push**: Authenticates via AWS OIDC and pushes tagged image (`sha-${{ github.sha }}`).
4. **GitOps Trigger**: Updates the image tag in the Kubernetes Helm values repository or triggers ArgoCD sync.
