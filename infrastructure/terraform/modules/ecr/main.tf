resource "aws_ecr_repository" "ecr_repository" {
  for_each = toset(var.ecr_repositories)

  name                 = each.key
  image_tag_mutability = var.image_tag_mutability
  force_delete         = true  # allows destroy even when images exist

  image_scanning_configuration {
    scan_on_push = var.scan_on_push
  }

  tags = var.tags
}

resource "aws_ecr_lifecycle_policy" "ecr_policy" {
  for_each   = toset(var.ecr_repositories)
  repository = aws_ecr_repository.ecr_repository[each.key].name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep only last 10 images to stay inside Free Tier"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = 10
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}
