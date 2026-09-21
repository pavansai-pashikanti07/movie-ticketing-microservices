output "vpc_id" {
  description = "The ID of the VPC"
  value       = module.vpc.vpc_id
}

output "public_subnets" {
  description = "List of public subnet IDs"
  value       = module.vpc.public_subnets
}

output "private_subnets" {
  description = "List of private subnet IDs"
  value       = module.vpc.private_subnets
}

output "vpc_cidr_block" {
  description = "The CIDR block of the VPC"
  value       = module.vpc.vpc_cidr_block
}

output "cluster_name" {
  description = "The name of the EKS cluster"
  value       = module.eks.cluster_name
}

output "cluster_endpoint" {
  description = "Endpoint for EKS control plane"
  value       = module.eks.cluster_endpoint
}

output "ecr_repository_urls" {
  description = "The URLs of the ECR repositories"
  value       = module.ecr.ecr_repository_url
}

output "booking_sqs_queue_url" {
  description = "URL of the booking events SQS queue"
  value       = module.booking_sqs.queue_id
}

output "booking_sqs_queue_arn" {
  description = "ARN of the booking events SQS queue"
  value       = module.booking_sqs.queue_arn
}

output "rds_endpoint" {
  description = "Connection endpoint for the RDS PostgreSQL database"
  value       = module.rds.db_endpoint
}

output "assets_bucket_name" {
  description = "Name of the S3 assets bucket"
  value       = module.s3_assets.bucket_id
}

output "alb_controller_role_arn" {
  description = "IAM Role ARN for AWS Load Balancer Controller"
  value       = module.iam.alb_controller_role_arn
}

output "external_secrets_role_arn" {
  description = "IAM Role ARN for External Secrets Operator"
  value       = module.iam.external_secrets_role_arn
}

output "github_actions_role_arn" {
  description = "IAM Role ARN for GitHub Actions OIDC CI/CD"
  value       = module.iam.github_actions_role_arn
}

output "cloudfront_domain_name" {
  description = "Domain name for CloudFront distribution"
  value       = module.cloudfront.cloudfront_domain_name
}

output "secrets_manager_arn" {
  description = "ARN of the Secrets Manager credentials secret"
  value       = module.secrets.secret_arn
}

output "redis_endpoint" {
  description = "Connection endpoint for ElastiCache Redis"
  value       = module.elasticache.redis_endpoint
}

output "sns_alerts_topic_arn" {
  description = "ARN of the SNS alerts topic"
  value       = module.sns_alerts.topic_arn
}


