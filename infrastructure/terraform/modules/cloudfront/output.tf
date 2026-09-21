output "cloudfront_domain_name" {
  description = "The domain name corresponding to the distribution"
  value       = aws_cloudfront_distribution.s3_distribution.domain_name
}

output "cloudfront_distribution_id" {
  description = "The identifier for the distribution"
  value       = aws_cloudfront_distribution.s3_distribution.id
}

output "cloudfront_arn" {
  description = "The ARN of the distribution"
  value       = aws_cloudfront_distribution.s3_distribution.arn
}
