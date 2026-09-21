output "redis_endpoint" {
  description = "The address of the Redis cache node"
  value       = aws_elasticache_cluster.redis.cache_nodes[0].address
}

output "redis_port" {
  description = "The port number on which Redis accepts connections"
  value       = aws_elasticache_cluster.redis.port
}
