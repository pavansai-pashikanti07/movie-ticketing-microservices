resource "aws_sns_topic" "alerts" {
  name = var.name

  tags = merge(var.tags, {
    Name = var.name
  })
}
