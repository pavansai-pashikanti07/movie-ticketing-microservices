output "queue_id" {
  description = "The URL of the SQS Queue"
  value       = aws_sqs_queue.main.id
}

output "queue_arn" {
  description = "The ARN of the SQS Queue"
  value       = aws_sqs_queue.main.arn
}

output "dlq_arn" {
  description = "The ARN of the Dead Letter Queue"
  value       = aws_sqs_queue.dlq.arn
}
