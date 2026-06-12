module "networking" {
  source     = "../../modules/networking"
  project_id = var.project_id
  env        = "production"
  region     = var.region
}

module "cloud_sql" {
  source      = "../../modules/cloud-sql"
  project_id  = var.project_id
  env         = "production"
  region      = var.region
  vpc_id      = module.networking.vpc_id
  db_password = var.db_password
  tier        = "db-g1-small"
}

module "redis" {
  source         = "../../modules/redis"
  project_id     = var.project_id
  env            = "production"
  region         = var.region
  vpc_id         = module.networking.vpc_id
  memory_size_gb = 2
}

module "secrets" {
  source        = "../../modules/secrets"
  env           = "production"
  database_url  = "postgresql://app:${var.db_password}@${module.cloud_sql.private_ip}:5432/${module.cloud_sql.db_name}"
  redis_url     = "redis://${module.redis.host}:${module.redis.port}"
  cloud_run_sa  = module.cloud_run.service_account
}

module "cloud_run" {
  source                  = "../../modules/cloud-run"
  project_id              = var.project_id
  env                     = "production"
  region                  = var.region
  image                   = var.image
  vpc_connector           = module.networking.connector_name
  db_url_secret_id        = module.secrets.db_url_secret_id
  redis_url_secret_id     = module.secrets.redis_url_secret_id
  min_instances           = 1
  max_instances           = 20
  latest_traffic_percent  = var.canary_percent
  stable_revision         = var.stable_revision
}

output "service_url" { value = module.cloud_run.service_url }
