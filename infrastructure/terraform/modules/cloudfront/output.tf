output "cloudfront_domain_name" {
  description = "The domain name corresponding to the distribution (or S3 regional domain fallback if disabled)"
  value       = var.enabled && length(aws_cloudfront_distribution.s3_distribution) > 0 ? aws_cloudfront_distribution.s3_distribution[0].domain_name : var.bucket_regional_domain_name
}

output "cloudfront_distribution_id" {
  description = "The identifier for the distribution"
  value       = var.enabled && length(aws_cloudfront_distribution.s3_distribution) > 0 ? aws_cloudfront_distribution.s3_distribution[0].id : null
}

output "cloudfront_arn" {
  description = "The ARN of the distribution"
  value       = var.enabled && length(aws_cloudfront_distribution.s3_distribution) > 0 ? aws_cloudfront_distribution.s3_distribution[0].arn : null
}
