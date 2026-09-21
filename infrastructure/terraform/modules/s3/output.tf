output "bucket_id" {
  description = "The name of the bucket"
  value       = aws_s3_bucket.assets_bucket.id
}

output "bucket_arn" {
  description = "The ARN of the bucket"
  value       = aws_s3_bucket.assets_bucket.arn
}

output "bucket_regional_domain_name" {
  description = "The regional domain name of the S3 bucket for CloudFront origin"
  value       = aws_s3_bucket.assets_bucket.bucket_regional_domain_name
}

