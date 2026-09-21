output "alb_controller_role_arn" {
  description = "IAM Role ARN for AWS Load Balancer Controller"
  value       = aws_iam_role.alb_controller_role.arn
}

output "external_secrets_role_arn" {
  description = "IAM Role ARN for External Secrets Operator"
  value       = aws_iam_role.external_secrets_role.arn
}

output "app_services_role_arn" {
  description = "IAM Role ARN for Microservice Pods (SQS & S3 access)"
  value       = aws_iam_role.app_services_role.arn
}

output "github_actions_role_arn" {
  description = "IAM Role ARN for GitHub Actions OIDC CI/CD"
  value       = aws_iam_role.github_actions_role.arn
}
