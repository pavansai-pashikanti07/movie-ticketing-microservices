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

  access_entries = {
    root_admin = {
      principal_arn = "arn:aws:iam::304960798044:root"
      policy_associations = {
        admin = {
          policy_arn = "arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy"
          access_scope = {
            type = "cluster"
          }
        }
      }
    }
  }

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
      desired_size   = 3
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

# Grant GitHub Actions IAM Role Cluster Admin Access to EKS
resource "aws_eks_access_entry" "github_actions" {
  cluster_name  = module.eks.cluster_name
  principal_arn = module.iam.github_actions_role_arn
  type          = "STANDARD"
}

resource "aws_eks_access_policy_association" "github_actions_admin" {
  cluster_name  = module.eks.cluster_name
  policy_arn    = "arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy"
  principal_arn = module.iam.github_actions_role_arn

  access_scope {
    type = "cluster"
  }
}


## CloudFront CDN (Edge Delivery for Movie Posters & S3 Assets)
module "cloudfront" {
  source = "../../modules/cloudfront"

  enabled                     = var.enable_cloudfront
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


## ============================================================================
## Kubernetes In-Cluster Add-ons (Automated GitOps & Ingress via Helm)
## ============================================================================

# 1. AWS Load Balancer Controller ServiceAccount (IRSA)
resource "kubernetes_service_account" "aws_load_balancer_controller" {
  metadata {
    name      = "aws-load-balancer-controller"
    namespace = "kube-system"
    annotations = {
      "eks.amazonaws.com/role-arn" = module.iam.alb_controller_role_arn
    }
    labels = {
      "app.kubernetes.io/component" = "controller"
      "app.kubernetes.io/name"      = "aws-load-balancer-controller"
    }
  }

  depends_on = [module.eks]
}

# 2. AWS Load Balancer Controller Helm Release (Auto-Creates AWS ALBs & TargetGroups)
resource "helm_release" "aws_load_balancer_controller" {
  name       = "aws-load-balancer-controller"
  repository = "https://aws.github.io/eks-charts"
  chart      = "aws-load-balancer-controller"
  namespace  = "kube-system"

  set {
    name  = "clusterName"
    value = module.eks.cluster_name
  }

  set {
    name  = "serviceAccount.create"
    value = "false"
  }

  set {
    name  = "serviceAccount.name"
    value = kubernetes_service_account.aws_load_balancer_controller.metadata[0].name
  }

  set {
    name  = "region"
    value = "ap-south-2"
  }

  set {
    name  = "vpcId"
    value = module.vpc.vpc_id
  }

  depends_on = [
    module.eks,
    kubernetes_service_account.aws_load_balancer_controller
  ]
}

# 3. Argo CD Namespace
resource "kubernetes_namespace" "argocd" {
  metadata {
    name = "argocd"
  }

  depends_on = [module.eks]
}

# 4. Argo CD Helm Release (Continuous Declarative GitOps)
resource "helm_release" "argocd" {
  name       = "argo-cd"
  repository = "https://argoproj.github.io/argo-helm"
  chart      = "argo-cd"
  namespace  = kubernetes_namespace.argocd.metadata[0].name

  set {
    name  = "server.service.type"
    value = "ClusterIP"
  }

  # Optimize for FinOps / Spot node capacity (disable unused Dex & Notification workers)
  set {
    name  = "dex.enabled"
    value = "false"
  }

  set {
    name  = "notifications.enabled"
    value = "false"
  }

  depends_on = [
    module.eks,
    kubernetes_namespace.argocd
  ]
}


