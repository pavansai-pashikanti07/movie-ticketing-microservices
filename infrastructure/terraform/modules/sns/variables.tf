variable "name" {
  description = "Name of the SNS topic"
  type        = string
}

variable "tags" {
  description = "Tags for the SNS topic"
  type        = map(string)
  default     = {}
}
