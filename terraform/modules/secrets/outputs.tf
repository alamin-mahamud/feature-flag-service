output "db_url_secret_id"    { value = google_secret_manager_secret.db_url.secret_id }
output "redis_url_secret_id" { value = google_secret_manager_secret.redis_url.secret_id }
