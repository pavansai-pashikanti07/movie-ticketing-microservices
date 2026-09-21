variable "name" {
  description = "Name for the ElastiCache cluster"
  type        = string
}

variable "node_type" {
  description = "ElastiCache instance type (cache.t3.micro is Free Tier eligible)"
  type        = string
  default     = "cache.t3.micro"
}

variable "vpc_id" {
  description = "VPC ID where ElastiCache is deployed"
  type        = string
}

variable "subnet_ids" {
  description = "Subnet IDs for ElastiCache subnet group"
  type        = list(string)
}

variable "eks_security_group_id" {
  description = "Security group ID of EKS nodes allowed to connect on port 6379"
  type        = string
}

variable "tags" {
  description = "Tags for ElastiCache resources"
  type        = map(string)
  default     = {}
}
