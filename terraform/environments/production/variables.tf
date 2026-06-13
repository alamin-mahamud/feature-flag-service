variable "project_id" { type = string }
variable "region" {
  type    = string
  default = "us-central1"
}
variable "image"       { type = string }
variable "db_password" {
  type      = string
  sensitive = true
}
variable "canary_percent" {
  type    = number
  default = 100
}
variable "stable_revision" {
  type    = string
  default = ""
}
