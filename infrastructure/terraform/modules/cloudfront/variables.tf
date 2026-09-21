variable "bucket_id" {
  description = "Name/ID of the S3 bucket"
  type        = string
}

variable "bucket_arn" {
  description = "ARN of the S3 bucket"
  type        = string
}

variable "bucket_regional_domain_name" {
  description = "Regional domain name of the S3 bucket origin"
  type        = string
}

variable "tags" {
  description = "Tags for CloudFront resources"
  type        = map(string)
  default     = {}
}
