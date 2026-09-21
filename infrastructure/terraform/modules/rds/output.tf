output "db_endpoint" {
  description = "Connection endpoint of the PostgreSQL database"
  value       = aws_db_instance.postgres.endpoint
}

output "db_address" {
  description = "Hostname address of the PostgreSQL database"
  value       = aws_db_instance.postgres.address
}

output "db_port" {
  description = "Port of the PostgreSQL database"
  value       = aws_db_instance.postgres.port
}

output "db_name" {
  description = "Database name"
  value       = aws_db_instance.postgres.db_name
}
