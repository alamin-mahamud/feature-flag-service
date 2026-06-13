output "dashboard_url" {
  value = "https://console.cloud.google.com/monitoring/dashboards/custom/${google_monitoring_dashboard.main.id}?project=${var.project_id}"
}

output "notification_channel_id" {
  value = google_monitoring_notification_channel.email.id
}
