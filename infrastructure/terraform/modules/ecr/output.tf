output "ecr_repository_url" {
  value = {
    for k, v in aws_ecr_repository.ecr_repository : k => v.repository_url
  }
}
