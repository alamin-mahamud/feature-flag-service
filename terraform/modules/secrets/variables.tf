variable "env"          { type = string }
variable "database_url" { type = string; sensitive = true }
variable "redis_url"    { type = string; sensitive = true }
variable "cloud_run_sa" { type = string }
