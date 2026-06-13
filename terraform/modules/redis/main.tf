resource "google_redis_instance" "cache" {
  name           = "${var.project_id}-${var.env}-redis"
  tier           = var.env == "production" ? "STANDARD_HA" : "BASIC"
  memory_size_gb = var.memory_size_gb
  region         = var.region

  authorized_network = var.vpc_id
  connect_mode       = "DIRECT_PEERING"

  redis_version     = "REDIS_7_0"
  display_name      = "Feature Flag Service Cache (${var.env})"
}
