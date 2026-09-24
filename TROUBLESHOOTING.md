# CinePass GitOps & Infrastructure Troubleshooting Guide

This post-mortem troubleshooting runbook documents all technical issues encountered during the CinePass microservices deployment, infrastructure recreation, GitOps automation, and security hardening—including root causes, troubleshooting commands, and permanent fixes.

---

## Architecture Context
- **Cloud Provider**: AWS (`ap-south-2` / Hyderabad)
- **Kubernetes Cluster**: Amazon EKS v1.31 (`cinepass-dev-eks`)
- **Compute**: Spot EC2 instances (`t3.small` with 11-pod limit per node)
- **Continuous Delivery**: Argo CD GitOps (`cinepass-dev` Application)
- **Secrets Management**: AWS Secrets Manager (`cinepass/dev/credentials`) bridged into EKS via External Secrets Operator (ESO)
- **CI Pipelines**: GitHub Actions with OpenID Connect (OIDC) IAM Role authentication

---

## Summary of Issues & Resolutions

| # | Issue Category | Root Cause | Resolution |
|---|----------------|------------|------------|
| 1 | **Terraform Destroy VPC Deadlock** | AWS ALB, Ingress ENIs, and Argo CD Finalizers locked subnets and namespaces. | Created automated pre-destroy script ([`destroy.ps1`](file:///f:/movie/movie-ticketing-microservices/scripts/destroy.ps1)) to clear Ingresses and patch finalizers. |
| 2 | **Argo CD Application `Degraded`** | Missing `metrics-server` prevented Horizontal Pod Autoscaler (HPA) from querying CPU metrics. | Deployed official `metrics-server` v0.7.2 manifests to EKS. |
| 3 | **GitHub Actions CI/CD Failures** | Cache key mismatches, outdated actions (v3), and Git concurrency push race conditions. | Upgraded to GitHub Actions v4/v6; added exponential backoff retry loop for GitOps tag commits. |
| 4 | **Plaintext Secrets in Git** | Legacy `01-secret.yaml` contained DB & JWT passwords in version control. | Purged `01-secret.yaml` from Git; deployed External Secrets Operator with IRSA to pull directly from AWS Secrets Manager. |
| 5 | **Shell CLI Syntax Errors** | Attempting to run PowerShell .NET decode snippet in Git Bash / WSL. | Provided platform-specific base64 decode commands for PowerShell and Bash. |

---

## Detailed Post-Mortem & Troubleshooting Steps

### Issue 1: Terraform Destroy Hanging / VPC Subnet Dependency Violation
#### Problem Statement
Running `terraform destroy` failed or hung indefinitely with `DependencyViolation: The vpc 'vpc-xxxx' has dependencies and cannot be deleted` or `The subnet 'subnet-xxxx' has dependencies (network interfaces in use)`.

#### Root Causes
1. **AWS Load Balancer Controller ENIs**: When Kubernetes `Ingress` is created, the AWS Load Balancer Controller provisions an Application Load Balancer (ALB) and network interfaces (ENIs) inside public subnets. Terraform cannot delete subnets while ALBs exist.
2. **Argo CD Application Finalizers**: The `cinepass-dev` Application had `resources-finalizer.argocd.argoproj.io`. When deleting namespaces or Argo CD before children, Kubernetes namespaces get permanently stuck in `Terminating`.
3. **Leftover Security Groups**: `k8s-cinepass-*` and `k8s-traffic-*` security groups cross-referenced each other and active ENIs.

#### Troubleshooting & Diagnostic Commands
```bash
# Check if ALBs are still active in the VPC
aws elbv2 describe-load-balancers --region ap-south-2 --query "LoadBalancers[*].[LoadBalancerName,State.Code,VpcId]" --output table

# Check lingering Elastic Network Interfaces (ENIs) attached to subnets
aws ec2 describe-network-interfaces --region ap-south-2 --filters "Name=vpc-id,Values=<YOUR_VPC_ID>" --query "NetworkInterfaces[*].[NetworkInterfaceId,InterfaceType,Description,Status]" --output table

# Check if namespaces are stuck in 'Terminating' status
kubectl get namespaces

# Check for finalizers blocking resource deletion
kubectl get applications.argoproj.io -n argocd
kubectl get ns cinepass-dev -o jsonpath='{.spec.finalizers}'
```

#### Permanent Fix
1. Patch and remove finalizers from Argo CD application before teardown:
   ```bash
   kubectl patch application cinepass-dev -n argocd -p '{"metadata":{"finalizers":null}}' --type=merge
   ```
2. Delete Ingress resources first so AWS LB Controller safely cleans up the ALB:
   ```bash
   kubectl delete ingress --all -A --timeout=120s
   ```
3. Created [`scripts/destroy.ps1`](file:///f:/movie/movie-ticketing-microservices/scripts/destroy.ps1) to automate:
   - Ingress and Helm release cleanup
   - Target group and ALB deletion checks
   - Clean `terraform destroy -auto-approve`

---

### Issue 2: Argo CD Application Status `Degraded`
#### Problem Statement
Argo CD displayed the `cinepass-dev` application with a red/degraded status icon, even though application pods were running.

#### Root Causes
1. The deployment included a `HorizontalPodAutoscaler` (`booking-service-hpa`).
2. AWS EKS does not install a Metrics Server by default.
3. HPA reported: `failed to get cpu utilization: unable to get metrics for resource cpu: no metrics returned from resource metrics API`.
4. Argo CD marks any resource whose health check reports failing conditions as `Degraded`.

#### Troubleshooting & Diagnostic Commands
```bash
# Inspect Argo CD application health details
kubectl get application cinepass-dev -n argocd -o yaml

# Inspect HPA resource status and events
kubectl get hpa -n cinepass-dev
kubectl describe hpa booking-service-hpa -n cinepass-dev

# Verify if Kubernetes Metrics API service is registered and available
kubectl get apiservice v1beta1.metrics.k8s.io
```

#### Permanent Fix
Deploy the official Kubernetes Metrics Server manifest:
```bash
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
```
Verify metrics are streaming:
```bash
# Check node and pod metrics
kubectl top nodes
kubectl top pods -n cinepass-dev

# Re-check HPA status (should show targets e.g., 0%/70%)
kubectl get hpa -n cinepass-dev
```
Argo CD immediately transitioned to **Synced 🟢** and **Healthy 💚**.

---

### Issue 3: GitHub Actions CI/CD Failures (GitOps Migration)
#### Problem Statement
- Legacy workflows were directly running `kubectl apply` inside GitHub Actions runners using cluster credentials.
- Workflows failed during npm cache steps with `Dependencies lock file is not found`.
- Concurrent workflows pushing image tag updates to `main` collided, causing git rejection:
  `! [rejected] main -> main (fetch first) error: failed to push some refs`.

#### Root Causes
1. **Cache Config**: `cache-dependency-path` pointed to root `./package-lock.json` instead of `./services/<service-name>/package-lock.json`.
2. **Outdated Actions**: Actions used deprecated versions (`actions/checkout@v3`, `docker/build-push-action@v2`).
3. **Race Condition**: 5 microservices workflows ran simultaneously on push. All 5 attempted to commit updated image tags to `k8s/manifests/` at the exact same second, rejecting non-fast-forward pushes.

#### Troubleshooting & Diagnostic Commands
```bash
# View recent workflow runs
gh run list --limit 10

# Inspect specific failed workflow logs
gh run view <RUN_ID> --log-failed

# Check local git branch sync
git fetch origin
git status
```

#### Permanent Fix
1. **Workflow Backup**: Moved legacy push-to-cluster workflows to [`.github/backup/`](file:///f:/movie/movie-ticketing-microservices/.github/backup/).
2. **Action Modernization**: Upgraded all actions in [`.github/workflows/`](file:///f:/movie/movie-ticketing-microservices/.github/workflows/):
   - `actions/checkout@v4`
   - `actions/setup-node@v4` with accurate `cache-dependency-path: services/<name>/package-lock.json`
   - `docker/setup-buildx-action@v3`
   - `docker/build-push-action@v6`
   - `aws-actions/configure-aws-credentials@v4` (using IAM OIDC role `cinepass-dev-github-actions-role`)
3. **GitOps Concurrency Retry Loop**: Added automated rebase-and-push retry loop in every workflow's GitOps promotion step:
   ```bash
   for i in {1..5}; do
     git pull --rebase origin main && git push origin main && break || sleep $((RANDOM % 3 + 1))
   done
   ```
4. **GitOps Separation of Concerns**: GitHub Actions now ONLY builds images, pushes to Amazon ECR, and updates the manifest tag. Argo CD autonomously pulls and synchronizes the cluster state.

---

### Issue 4: Plaintext Secrets in Git vs AWS Secrets Manager (External Secrets Operator)
#### Problem Statement
Database passwords and JWT secret keys were saved in plaintext within `k8s/manifests/01-secret.yaml` and committed to Git, violating GitOps security principles.

#### Root Cause
Kubernetes manifests required a `Secret` named `cinepass-credentials`. Without an automated bridge, a static `01-secret.yaml` had been placed in the repository.

#### Solution Architecture: External Secrets Operator (ESO)
Instead of storing secrets in Git, we integrate AWS Secrets Manager directly with EKS using IRSA (IAM Roles for Service Accounts):

```
+-------------------------------------------------------------------+
|  AWS Secrets Manager: "cinepass/dev/credentials"                   |
|  - db_password                                                    |
|  - jwt_secret                                                     |
+---------------------------------+---------------------------------+
                                  |
                                  | IRSA Role: cinepass-dev-external-secrets-role
                                  v
+-------------------------------------------------------------------+
|  External Secrets Operator (Namespace: external-secrets)          |
|  - ClusterSecretStore: cinepass-aws-secrets-store                 |
|  - ServiceAccount: external-secrets-sa                            |
+---------------------------------+---------------------------------+
                                  |
                                  | Auto-generates in-memory
                                  v
+-------------------------------------------------------------------+
|  Kubernetes Secret (Namespace: cinepass-dev)                      |
|  - Name: cinepass-credentials                                     |
|  - Injected as environment variables to microservices             |
+-------------------------------------------------------------------+
```

#### Troubleshooting & Node Resource Constraint (`t3.small`)
During ESO Helm installation on `t3.small` nodes (max 11 pods per node), pods failed with:
`0/2 nodes are available: 2 Too many pods`.
- **Diagnostic Command**:
  ```bash
  kubectl describe nodes | grep -A 5 "Allocated resources"
  ```
- **Remediation**:
  - The ESO `cert-controller` and `webhook` pods were not required for basic Secrets Manager polling.
  - Scaled down non-essential pods and removed validating webhooks:
    ```bash
    kubectl scale deployment external-secrets-cert-controller -n external-secrets --replicas=0
    kubectl scale deployment external-secrets-webhook -n external-secrets --replicas=0
    kubectl delete validatingwebhookconfiguration external-secrets-validate external-secrets-webhook
    ```
  - ESO Core Controller scheduled cleanly.

#### Secrets Verification Commands
```bash
# Verify ClusterSecretStore status
kubectl get clustersecretstore cinepass-aws-secrets-store
# Output must show: STATUS: Valid, READY: True

# Verify ExternalSecret sync status
kubectl get externalsecret -n cinepass-dev
# Output must show: STATUS: SecretSynced, READY: True

# Verify target Kubernetes Secret exists without plaintext in Git
kubectl get secret cinepass-credentials -n cinepass-dev
kubectl get secret cinepass-credentials -n cinepass-dev -o jsonpath='{.data.DB_PASSWORD}' | base64 --decode
```

#### Git Repository Cleanup
1. Deleted `01-secret.yaml` permanently from Git:
   ```bash
   git rm k8s/manifests/01-secret.yaml
   ```
2. Replaced resource entry in `k8s/manifests/kustomization.yaml`:
   ```yaml
   resources:
     - 00-namespace.yaml
     - 01-configmap.yaml
     - 01-external-secret.yaml # Replaces 01-secret.yaml
     - 01-auth-service.yaml
   ```

---

### Issue 5: PowerShell vs Bash Decode Command Syntax Error
#### Problem Statement
User ran the following command in Git Bash / WSL and received a syntax error:
```bash
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($input))
# bash: syntax error near unexpected token `[System.Convert]::FromBase64String'
```

#### Root Cause
`[System.Convert]::FromBase64String` is **PowerShell (.NET)** syntax. In Git Bash or Linux shells, `[` is parsed as the `test` binary, causing a bash syntax crash.

#### Commands for Both Shells
- **For Windows PowerShell / pwsh**:
  ```powershell
  $b64 = kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}"
  [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($b64))
  ```
- **For Git Bash / Linux / macOS**:
  ```bash
  kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 --decode && echo ""
  ```

---

## Complete Verification & Operations Command Cheat Sheet

### 1. External Secrets & Security
```bash
# View ClusterSecretStore
kubectl get clustersecretstore -A

# Check ExternalSecret sync status
kubectl get externalsecret -n cinepass-dev

# View generated secret metadata (verify managed by ESO)
kubectl describe secret cinepass-credentials -n cinepass-dev
```

### 2. Argo CD Operations
```bash
# Check Argo CD server pods
kubectl get pods -n argocd

# Port-forward Argo CD UI to local browser (https://localhost:8080)
kubectl port-forward -n argocd svc/argo-cd-argocd-server 8080:443

# Retrieve Argo CD admin password
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 --decode && echo ""

# Check application sync and health
kubectl get applications.argoproj.io -n argocd
```

### 3. Application Pods & Autoscaling
```bash
# Check all microservices pods
kubectl get pods -n cinepass-dev -o wide

# Check HPA status
kubectl get hpa -n cinepass-dev

# Check Ingress and ALB URL
kubectl get ingress -n cinepass-dev
```

### 4. GitOps Flow (Promoting a New Version)
```bash
# When pushing new code to a microservice:
# 1. GitHub Actions triggers, runs tests, and pushes image to Amazon ECR.
# 2. GitHub Actions updates image tag in k8s/manifests/<service>.yaml.
# 3. Argo CD detects Git commit, pulls manifests, and updates pods automatically.
```
