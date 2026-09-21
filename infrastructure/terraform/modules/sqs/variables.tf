variable "name" {
  description = "Name of the SQS queue"
  type        = string
}

variable "visibility_timeout_seconds" {
  description = "Time in seconds a worker has to process the message before it becomes visible again"
  type        = number
  default     = 60
}

variable "message_retention_seconds" {
  description = "Duration in seconds to retain messages (Default: 4 days)"
  type        = number
  default     = 345600
}

variable "max_receive_count" {
  description = "Number of retries before sending to Dead Letter Queue (DLQ)"
  type        = number
  default     = 3
}

variable "tags" {
  description = "Tags for the SQS queue"
  type        = map(string)
  default     = {}
}
