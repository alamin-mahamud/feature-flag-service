variable "project_id"          { type = string }
variable "env"                  { type = string }
variable "region"               { type = string }
variable "image"                { type = string }
variable "vpc_connector"        { type = string }
variable "db_url_secret_id"     { type = string }
variable "redis_url_secret_id"  { type = string }
variable "min_instances"        { type = number; default = 0 }
variable "max_instances"        { type = number; default = 10 }
variable "latest_traffic_percent" { type = number; default = 100 }
variable "stable_revision"      { type = string; default = "" }
