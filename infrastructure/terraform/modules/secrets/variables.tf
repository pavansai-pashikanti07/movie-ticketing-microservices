variable "name" {
  description = "Name for the secret in Secrets Manager"
  type        = string
}

variable "secret_values" {
  description = "Key-value map of secrets to store"
  type        = map(string)
  sensitive   = true
}

variable "tags" {
  description = "Tags for the secret"
  type        = map(string)
  default     = {}
}
