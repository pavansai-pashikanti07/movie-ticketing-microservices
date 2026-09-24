# 🚀 CinePass — Enterprise GitOps & Infrastructure Lifecycle Architecture

> **Complete architectural blueprint** detailing the dual-mode delivery pipeline (GitHub Actions OIDC + Argo CD GitOps), day-1 infrastructure provisioning, day-2 continuous deployment, and zero-downtime FinOps lifecycle management.

---

## 📑 Table of Contents
1. [Core Philosophy: Foundation First, Application Second](#1-core-philosophy)
2. [Dual-Delivery Architecture (GitOps vs Direct Push)](#2-dual-delivery-architecture)
3. [Argo CD In-Cluster Engine & Dashboard Access](#3-argo-cd-in-cluster-engine)
4. [Day-1 vs Day-2 Operational Lifecycle](#4-day-1-vs-day-2-operational-lifecycle)
5. [How to Switch Between GitOps & GitHub Direct Push](#5-how-to-switch-between-gitops--direct-push)
6. [Teardown & FinOps Cost Optimization](#6-teardown--finops-cost-optimization)

---

## 1. Core Philosophy: Foundation First, Application Second

In modern enterprise cloud computing, applications cannot run without their underlying cloud dependencies. The deployment order is strictly:

```text
[PHASE 1: Infrastructure Provisioning]
Terraform Apply (VPC, Subnets, EKS Cluster, ECR, RDS, Redis, SQS, IAM, Helm)
                         │
                         ▼  (Infra Foundation Ready)
[PHASE 2: Application Delivery]
GitHub Actions (Lint, Test, Docker Build, Push to ECR, Git Tag Update)
                         │
                         ▼  (Git Committed as Single Source of Truth)
[PHASE 3: In-Cluster GitOps Sync]
Argo CD Controller (Watches Git Repo, Pulls Manifests, Syncs into EKS)
                         │
                         ▼  (Pods Healthy 1/1 Running)
[PHASE 4: Live Traffic Ingress]
AWS Load Balancer Controller (Provisions Internet-Facing ALB, Routes Traffic)
```

### Why Workflows Cannot Run Before Terraform:
1. **ECR Repositories**: Docker images cannot be pushed if the private repositories (`cinepass/auth-service`, etc.) have not been created by Terraform.
2. **EKS Cluster**: Kubernetes manifests and pods cannot be deployed without an active EKS API server endpoint.
3. **Database & Cache**: Services crash in `CrashLoopBackOff` if RDS PostgreSQL and ElastiCache Redis endpoints are not available.

---

## 2. Dual-Delivery Architecture

CinePass is architected to support **both modern GitOps (Pull model)** and **traditional CI/CD (Push model)** without modifying any AWS IAM permissions:

| Dimension | GitOps with Argo CD (Current Default) | GitHub Actions Direct Push (Backup) |
|:---|:---|:---|
| **Delivery Model** | **Declarative Pull** | **Imperative Push** |
| **Cluster Access** | Argo CD runs inside the EKS VPC; zero cluster credentials needed outside. | GitHub Actions connects via AWS IAM OIDC Role (`cinepass-dev-github-actions-role`). |
| **Single Source of Truth** | **Git Repository** (`k8s/manifests/`). Every deployment is a Git commit. | Cluster runtime state can diverge if manual `kubectl` is applied. |
| **Drift Detection & Auto-Heal** | **Enabled 24/7**. If someone deletes or edits a pod/configmap, Argo CD restores it within seconds. | None. Manual drift remains until next pipeline run. |
| **Rollback Mechanism** | `git revert <commit>` immediately triggers Argo CD to roll back pods. | Requires re-running the GitHub Action workflow or manual `kubectl rollout undo`. |

---

## 3. Argo CD In-Cluster Engine

Argo CD was provisioned via Terraform Helm release (`resource "helm_release" "argocd"`) inside the `argocd` namespace.

### Live Application CR (`k8s/gitops/argo-application.yaml`)
```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: cinepass-dev
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/pavansai-pashikanti07/movie-ticketing-microservices.git
    targetRevision: main
    path: k8s/manifests
  destination:
    server: https://kubernetes.default.svc
    namespace: cinepass-dev
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
      - ServerSideApply=true
```

### 🖥️ How to Access the Argo CD Dashboard:
```powershell
# Step 1: Open port-forward to Argo CD Server
kubectl port-forward -n argocd svc/argo-cd-argocd-server 8080:443

# Step 2: Retrieve admin password
# For Bash / Git Bash:
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d ; echo

# For PowerShell:
$encoded = kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}"
[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($encoded))

# Step 3: Open in browser
# Navigate to: https://localhost:8080
# NOTE: Self-signed certificate error vasthe, browser lo "Advanced" -> "Proceed to localhost (unsafe)" kottandi.
# Username: admin
# Password: <output of step 2>
# Navigate to: https://localhost:8080
# Username: admin
# Password: <retrieved password>
```

---

## 4. Day-1 vs Day-2 Operational Lifecycle

### Day-1 (Initial Bootstrap):
1. Run `terraform apply -auto-approve` in `infrastructure/terraform/env/dev`.
2. Apply External Secrets CRDs and base manifests (`kubectl apply -k k8s/manifests`).
3. Apply Argo CD application manifest (`kubectl apply -f k8s/gitops/argo-application.yaml`).
4. Trigger GitHub Action workflows via `gh workflow run` to build and populate initial ECR container images.

### Day-2 (Continuous Development):
* A developer edits code in `services/catalog-service/src/...` and pushes to `main`.
* **GitHub Actions** runs linting, unit tests, builds the Docker image tagged with the Git commit SHA, and pushes to Amazon ECR.
* **Manifest Promotion**: The workflow updates `k8s/manifests/02-catalog-service.yaml` with the new image SHA and commits it with `[skip ci]`.
* **Argo CD** detects the Git change, pulls the new manifest, and initiates a rolling zero-downtime deployment in EKS!

---

## 5. How to Switch Between GitOps & Direct Push

All AWS IAM roles and EKS access entries are **permanently preserved**:
* **AWS IAM Role**: `arn:aws:iam::304960798044:role/cinepass-dev-github-actions-role`
* **EKS Access Entry**: Standard cluster administrator policy attached to the role.

### To switch back to Direct Push (GitHub Actions `kubectl`):
The original direct-kubectl workflows are saved in [`.github/backup/`](file:///F:/movie/movie-ticketing-microservices/.github/backup/):
```powershell
# Restore direct-push workflows from backup
Copy-Item ".github\backup\*.yml" ".github\workflows\" -Force
git add .github/workflows/
git commit -m "chore: switch back to direct kubectl deployment workflows"
git push origin main
```

### To switch to GitOps (Argo CD):
```powershell
# Ensure Argo CD application is applied
kubectl apply -f k8s/gitops/argo-application.yaml
```

---

## 6. Teardown & FinOps Cost Optimization

To avoid paying for AWS resources when not in use (overnight/weekends), the platform provides automated zero-residue teardown and recreate capabilities.

### ⚠️ The Ingress Dependency Pitfall & Resolution:
When AWS Load Balancer Controller creates an Application Load Balancer for Kubernetes Ingress:
1. It attaches Elastic Network Interfaces (ENIs) with public IPs inside the VPC subnets.
2. It auto-creates security groups (`k8s-cinepass-*` and `k8s-traffic-*`).
3. Running a naked `terraform destroy` will hang on VPC deletion because AWS forbids deleting a VPC with non-default security groups or in-use ENIs.

### 🛡️ The Solution (`scripts/destroy.ps1`):
Always execute teardown via the automated helper script:
```powershell
.\scripts\destroy.ps1
```
This script:
1. Deletes the Ingress and `cinepass-dev` namespace first.
2. Deletes any lingering ALBs and waits for ENIs to detach.
3. Executes `terraform destroy -auto-approve` cleanly in 1 shot!

### ⏰ Morning Scheduled Recreate:
In [`.github/workflows/terraform-infra.yml`](file:///F:/movie/movie-ticketing-microservices/.github/workflows/terraform-infra.yml), a cron job runs daily at **05:50 AM IST** to automatically recreate the cluster, seed the databases, and generate a fresh live ALB URL before your workday begins!
