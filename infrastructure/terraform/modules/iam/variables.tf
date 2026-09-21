variable "name" {
  description = "Base prefix for resource naming"
  type        = string
}

variable "oidc_provider_arn" {
  description = "The ARN of the OIDC Provider for EKS"
  type        = string
}

variable "oidc_provider" {
  description = "The URL/host of the OIDC Provider for EKS (without https://)"
  type        = string
}

variable "github_repo" {
  description = "GitHub repository in format owner/repo (e.g. pavansai-pashikanti07/movie-ticketing-microservices)"
  type        = string
  default     = "pavansai-pashikanti07/movie-ticketing-microservices"
}

variable "sqs_queue_arn" {
  description = "ARN of the SQS Queue"
  type        = string
}

variable "s3_bucket_arn" {
  description = "ARN of the S3 Assets Bucket"
  type        = string
}

variable "tags" {
  description = "Tags to attach to IAM resources"
  type        = map(string)
  default     = {}
}
