variable "db_name" {
  description = "Name of the PostgreSQL database"
  type        = string
  default     = "cinepass_db"
}

variable "db_username" {
  description = "Database administrator username"
  type        = string
  default     = "postgres"
}

variable "db_password" {
  description = "Database administrator password"
  type        = string
  sensitive   = true
}

variable "instance_class" {
  description = "RDS instance class (db.t3.micro is Free Tier eligible)"
  type        = string
  default     = "db.t3.micro"
}

variable "allocated_storage" {
  description = "Allocated storage in GB"
  type        = number
  default     = 20
}

variable "vpc_id" {
  description = "VPC ID where RDS should be deployed"
  type        = string
}

variable "subnet_ids" {
  description = "Subnet IDs for the DB subnet group"
  type        = list(string)
}

variable "eks_security_group_id" {
  description = "Security group ID of the EKS nodes allowed to access the database"
  type        = string
}

variable "tags" {
  description = "Tags to attach to RDS resources"
  type        = map(string)
  default     = {}
}
