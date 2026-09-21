variable "name" {
  description = "Base name for resources"
  type        = string
}

variable "vpc_cidr" {
  description = "VPC CIDR block"
  type        = string
}

variable "availability_zone" {
  description = "List of availability zones"
  type        = list(string)
}

variable "public_subnets" {
  description = "List of public subnet CIDRs"
  type        = list(string)
}

variable "private_subnets" {
  description = "List of private subnet CIDRs"
  type        = list(string)
}

variable "tags" {
  description = "Common tags for all resources"
  type        = map(string)
  default     = {}
}

variable "public_subnet_tags" {
  description = "Additional tags for public subnets"
  type        = map(string)
  default     = {}
}

variable "private_subnet_tags" {
  description = "Additional tags for private subnets"
  type        = map(string)
  default     = {}
}

variable "kubernetes_version" {
  description = "EKS Kubernetes version"
  type        = string
  default     = "1.31"
}

variable "instance_types" {
  description = "Instance types for EKS worker nodes"
  type        = list(string)
  default     = ["t3.medium"]
}

variable "capacity_type" {
  description = "Capacity type for worker nodes (SPOT or ON_DEMAND)"
  type        = string
  default     = "SPOT"
}

variable "enable_cloudfront" {
  description = "Enable CloudFront distribution (set false if AWS account is unverified)"
  type        = bool
  default     = false
}

variable "ecr_repositories" {
  description = "List of ECR repository names"
  type        = list(string)
}

variable "db_password" {
  description = "Master password for the RDS PostgreSQL database"
  type        = string
  sensitive   = true
}

variable "assets_bucket_name" {
  description = "Name of the S3 bucket for movie assets"
  type        = string
}

variable "jwt_secret" {
  description = "JWT secret key for signing auth tokens"
  type        = string
  sensitive   = true
}

