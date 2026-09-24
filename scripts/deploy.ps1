# ==============================================================================
# CinePass Infrastructure & GitOps Deployment Automation
# One-click full environment bootstrap
# ==============================================================================

$ErrorActionPreference = "Stop"

Write-Host ">>> [1/4] Running Terraform Apply..." -ForegroundColor Cyan
Push-Location infrastructure/terraform/env/dev
try {
    terraform init
    terraform apply -auto-approve
} finally {
    Pop-Location
}

Write-Host ">>> [2/4] Connecting to EKS cluster..." -ForegroundColor Cyan
aws eks update-kubeconfig --region ap-south-2 --name cinepass-dev-eks

Write-Host ">>> [3/4] Installing Metrics Server for HPA..." -ForegroundColor Cyan
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml

Write-Host ">>> [4/4] Deploying Argo CD Application (GitOps Bootstrap)..." -ForegroundColor Cyan
kubectl apply -f k8s/gitops/argo-application.yaml

Write-Host "`n>>> Deployment completed successfully!" -ForegroundColor Green
Write-Host ">>> Microservices are syncing automatically via Argo CD." -ForegroundColor Green
Write-Host ">>> Run 'kubectl get applications -n argocd' or check the Argo CD UI at https://localhost:8080" -ForegroundColor Cyan
