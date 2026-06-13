module "networking" {
  source     = "../../modules/networking"
  project_id = var.project_id
  env        = "staging"
  region     = var.region
}

module "cloud_sql" {
  source      = "../../modules/cloud-sql"
  project_id  = var.project_id
  env         = "staging"
  region      = var.region
  vpc_id      = module.networking.vpc_id
  db_password = var.db_password
  tier        = "db-f1-micro"
  depends_on  = [module.networking]
}

module "redis" {
  source     = "../../modules/redis"
  project_id = var.project_id
  env        = "staging"
  region     = var.region
  vpc_id     = module.networking.vpc_id
  depends_on = [module.networking]
}

module "secrets" {
  source        = "../../modules/secrets"
  env           = "staging"
  database_url  = "postgresql://app:${var.db_password}@${module.cloud_sql.private_ip}:5432/${module.cloud_sql.db_name}"
  redis_url     = "redis://${module.redis.host}:${module.redis.port}"
  cloud_run_sa  = module.cloud_run.service_account
}

module "cloud_run" {
  source               = "../../modules/cloud-run"
  project_id           = var.project_id
  env                  = "staging"
  region               = var.region
  image                = var.image
  vpc_connector        = module.networking.connector_name
  db_url_secret_id     = module.secrets.db_url_secret_id
  redis_url_secret_id  = module.secrets.redis_url_secret_id
  min_instances        = 0
  max_instances        = 3
}

output "service_url" { value = module.cloud_run.service_url }
