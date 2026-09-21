## VPC 
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = var.name
  cidr = var.vpc_cidr

  azs             = var.availability_zone
  private_subnets = var.private_subnets
  public_subnets  = var.public_subnets

  enable_nat_gateway = false
  enable_vpn_gateway = false

  tags = merge(var.tags, { Name = "${var.name}-vpc" })

  enable_dns_support   = true
  enable_dns_hostnames = true

  map_public_ip_on_launch = true

  public_subnet_tags  = var.public_subnet_tags
  private_subnet_tags = var.private_subnet_tags
}


## EKS Cluster
module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 20.0"

  cluster_name    = "${var.name}-eks"
  cluster_version = var.kubernetes_version

  # Public access to the EKS cluster from internet (local kubectl)
  cluster_endpoint_public_access = true

  # Adds caller identity as cluster administrator via access entries
  enable_cluster_creator_admin_permissions = true

  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.public_subnets

  tags = merge(var.tags, { Name = "${var.name}-eks" })

  cloudwatch_log_group_retention_in_days = 1
  cluster_enabled_log_types              = ["api", "audit"]

  eks_managed_node_groups = {
    spot_nodes = {
      name           = "${var.name}-spot-ng"
      min_size       = 1
      max_size       = 3
      desired_size   = 2
      instance_types = var.instance_types
      capacity_type  = var.capacity_type

      iam_role_additional_policies = {
        CloudWatchAgentServerPolicy = "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy"
      }

      tags = merge(var.tags, {
        Name = "${var.name}-spot-node"
      })
    }
  }
}


## ECR (Private Container Registries for Microservices)
module "ecr" {
  source = "../../modules/ecr"

  ecr_repositories = var.ecr_repositories
  tags             = merge(var.tags, { Name = "${var.name}-ecr" })
}


## SQS (Booking Events to Notification Service)
module "booking_sqs" {
  source = "../../modules/sqs"

  name = "${var.name}-booking-queue"
  tags = merge(var.tags, { Name = "${var.name}-booking-queue" })
}


## RDS PostgreSQL (ACID Transactional Database)
module "rds" {
  source = "../../modules/rds"

  identifier            = "${var.name}-postgres"
  db_name               = "cinepass_db"
  db_password           = var.db_password
  vpc_id                = module.vpc.vpc_id
  subnet_ids            = module.vpc.public_subnets
  eks_security_group_id = module.eks.node_security_group_id

  tags = merge(var.tags, { Name = "${var.name}-postgres" })
}


## S3 Bucket (Movie Posters & Dynamic QR Tickets)
module "s3_assets" {
  source = "../../modules/s3"

  bucket_name = var.assets_bucket_name
  tags        = merge(var.tags, { Name = var.assets_bucket_name })
}


## IAM (IRSA Roles for K8s Controllers & GitHub Actions OIDC)
module "iam" {
  source = "../../modules/iam"

  name              = var.name
  oidc_provider_arn = module.eks.oidc_provider_arn
  oidc_provider     = module.eks.oidc_provider
  sqs_queue_arn     = module.booking_sqs.queue_arn
  s3_bucket_arn     = module.s3_assets.bucket_arn
  tags              = var.tags
}


## CloudFront CDN (Edge Delivery for Movie Posters & S3 Assets)
module "cloudfront" {
  source = "../../modules/cloudfront"

  bucket_id                   = module.s3_assets.bucket_id
  bucket_arn                  = module.s3_assets.bucket_arn
  bucket_regional_domain_name = module.s3_assets.bucket_regional_domain_name
  tags                        = var.tags
}


## AWS Secrets Manager (Encrypted Credentials for External Secrets Operator)
module "secrets" {
  source = "../../modules/secrets"

  name = "cinepass/dev/credentials"
  secret_values = {
    db_host     = module.rds.db_address
    db_port     = tostring(module.rds.db_port)
    db_name     = module.rds.db_name
    db_username = "postgres"
    db_password = var.db_password
    jwt_secret  = var.jwt_secret
  }

  tags = var.tags
}


## AWS ElastiCache Redis (In-Memory 5-Minute Atomic Seat Locking)
module "elasticache" {
  source = "../../modules/elasticache"

  name                  = "${var.name}-redis"
  vpc_id                = module.vpc.vpc_id
  subnet_ids            = module.vpc.public_subnets
  eks_security_group_id = module.eks.node_security_group_id
  tags                  = var.tags
}


## Amazon SNS (System Alerts & Notifications)
module "sns_alerts" {
  source = "../../modules/sns"

  name = "${var.name}-alerts"
  tags = var.tags
}


