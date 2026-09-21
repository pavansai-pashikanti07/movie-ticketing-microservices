terraform {
  backend "s3" {
    bucket       = "eks-microservice-07784"
    key          = "movies/dev/terraform.tfstate"
    region       = "ap-south-2"
    use_lockfile = true
  }
}
