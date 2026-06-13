variable "project_id" { type = string }
variable "env"        { type = string }
variable "region"     { type = string }
variable "vpc_id"     { type = string }
variable "db_password" {
  type      = string
  sensitive = true
}
variable "tier" {
  type    = string
  default = "db-f1-micro"
}
