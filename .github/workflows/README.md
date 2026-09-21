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

### 1. Granular Microservice CI/CD Pipelines:
Instead of building all 5 microservices on every git push, we use **Git Path Filters** across 5 dedicated workflows:

| Microservice | Workflow File | Monorepo Path | AWS ECR Repository | EKS Deployment |
| :--- | :--- | :--- | :--- | :--- |
| **Auth Service** | [`auth-service.yml`](./auth-service.yml) | `services/auth-service/**` | `cinepass-auth-service` | `deployment/auth-service` |
| **Catalog Service** | [`catalog-service.yml`](./catalog-service.yml) | `services/catalog-service/**` | `cinepass-catalog-service` | `deployment/catalog-service` |
| **Booking Service** | [`booking-service.yml`](./booking-service.yml) | `services/booking-service/**` | `cinepass-booking-service` | `deployment/booking-service` |
| **Payment Service** | [`payment-service.yml`](./payment-service.yml) | `services/payment-service/**` | `cinepass-payment-service` | `deployment/payment-service` |
| **Notification Service** | [`notification-service.yml`](./notification-service.yml) | `services/notification-service/**` | `cinepass-notification-service` | `deployment/notification-service` |

### 2. Pipeline Execution Stages:
1. **Stage 1: Test & Compile TypeScript**:
   - Checks out code and provisions Node.js 20 environment with npm package caching.
   - Runs `npm ci` and `npm run build` (`tsc`) to guarantee compile-time type safety.
2. **Stage 2: Continuous Delivery & EKS Rollout** (on `main` branch push):
   - Sets up Docker Buildx with GitHub Actions caching (`type=gha`).
   - Authenticates to AWS using IAM OIDC (`sts.amazonaws.com`) assuming `arn:aws:iam::304960798044:role/cinepass-dev-github-actions-role`.
   - Logs into Amazon ECR with zero static keys.
   - Builds and tags image with both `:latest` and commit SHA `:${{ github.sha }}`.
   - Updates kubeconfig for Amazon EKS cluster `cinepass-dev-cluster` in region `ap-south-2`.
   - Performs zero-downtime rolling update: `kubectl set image deployment/<svc> <svc>=<ecr-url>:<sha> -n cinepass-dev`.
   - Monitors deployment health with `kubectl rollout status deployment/<svc> -n cinepass-dev --timeout=180s`.

---

## 4. Production Deployment Gate & Manual Owner Approval

All 5 workflows now enforce an **Enterprise Deployment Approval Gate** via GitHub Environments:

```yaml
  deploy:
    name: "Build Container & Deploy to EKS"
    needs: test-and-build
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment:
      name: production
```

### How It Works:
1. When code is pushed or `workflow_dispatch` triggered, **Stage 1 (Tests & TypeScript Compile)** runs automatically.
2. The pipeline halts before **Stage 2 (Deploy)** and enters a `Waiting for review` state.
3. GitHub sends a notification/email to the designated owner (`pavansai-pashikanti07`).
4. The deployment only resumes when the owner clicks **"Review deployments" ➔ "Approve and deploy"**.

### How to Enable Owner Approval in GitHub:
1. In your GitHub repository, go to **Settings ➔ Environments**.
2. Click **New environment** and enter name: `production`.
3. Under **Deployment protection rules**, check **Required reviewers**.
4. Search and select your username: **`pavansai-pashikanti07`**.
5. Click **Save protection rules**.


