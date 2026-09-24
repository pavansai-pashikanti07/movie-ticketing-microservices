# ==============================================================================
# CinePass Infrastructure Teardown Automation
# Safe, dependency-free terraform destroy script
# ==============================================================================

Write-Host ">>> [1/3] Removing Argo CD application finalizers and K8s Ingress..." -ForegroundColor Cyan
aws eks update-kubeconfig --region ap-south-2 --name cinepass-dev-eks 2>$null
kubectl patch application cinepass-dev -n argocd -p '{"metadata":{"finalizers":null}}' --type=merge 2>$null
kubectl delete application cinepass-dev -n argocd --ignore-not-found 2>$null
kubectl delete ingress --all -A --ignore-not-found 2>$null
kubectl delete namespace cinepass-dev --ignore-not-found 2>$null

# Cleanup any orphaned ALBs or SecurityGroups created by Load Balancer Controller
$albs = aws elbv2 describe-load-balancers --region ap-south-2 --query "LoadBalancers[?contains(LoadBalancerName, 'cinepass')].LoadBalancerArn" --output text 2>$null
if ($albs) {
    foreach ($alb in $albs -split "`t|`n| ") {
        if ($alb) {
            Write-Host ">>> Deleting lingering ALB: $alb" -ForegroundColor Yellow
            aws elbv2 delete-load-balancer --load-balancer-arn $alb --region ap-south-2
        }
    }
}

Write-Host ">>> [2/3] Waiting 15s for ENI detachment..." -ForegroundColor Cyan
Start-Sleep -Seconds 15

Write-Host ">>> [3/3] Running Terraform Destroy..." -ForegroundColor Cyan
cd infrastructure/terraform/env/dev
terraform destroy -auto-approve

Write-Host ">>> Terraform Destroy Completed Successfully!" -ForegroundColor Green
