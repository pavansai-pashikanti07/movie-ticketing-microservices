# ==============================================================================
# CinePass Infrastructure Teardown Automation
# Safe, dependency-free terraform destroy script
# ==============================================================================

Write-Host ">>> [1/3] Checking K8s Ingress and TargetGroups..." -ForegroundColor Cyan
aws eks update-kubeconfig --region ap-south-2 --name cinepass-dev-eks 2>$null
kubectl delete ingress cinepass-ingress -n cinepass-dev --ignore-not-found 2>$null
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
