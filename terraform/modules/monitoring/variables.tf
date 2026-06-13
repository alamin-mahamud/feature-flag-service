variable "project_id" {
  type = string
}

variable "env" {
  type = string
}

variable "cloud_run_service_name" {
  type = string
}

variable "region" {
  type = string
}

variable "alert_email" {
  type        = string
  description = "Email address for alert notifications"
}

variable "latency_p99_threshold_ms" {
  type        = number
  default     = 1000
  description = "p99 latency alert threshold in milliseconds"
}

variable "error_rate_threshold_percent" {
  type        = number
  default     = 5
  description = "Error rate alert threshold as a percentage (0-100)"
}
