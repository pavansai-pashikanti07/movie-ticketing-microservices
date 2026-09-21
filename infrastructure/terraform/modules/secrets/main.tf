resource "aws_secretsmanager_secret" "secret" {
  name                    = var.name
  recovery_window_in_days = 0 # Force instant deletion on destroy for dev

  tags = merge(var.tags, {
    Name = var.name
  })
}

resource "aws_secretsmanager_secret_version" "secret_val" {
  secret_id     = aws_secretsmanager_secret.secret.id
  secret_string = jsonencode(var.secret_values)
}
