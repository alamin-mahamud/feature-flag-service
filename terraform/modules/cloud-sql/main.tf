resource "google_sql_database_instance" "postgres" {
  name             = "${var.project_id}-${var.env}-pg"
  database_version = "POSTGRES_16"
  region           = var.region
  deletion_protection = var.env == "production"

  settings {
    tier              = var.tier
    availability_type = var.env == "production" ? "REGIONAL" : "ZONAL"
    disk_autoresize   = true
    disk_size         = 20

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = var.env == "production"
    }

    ip_configuration {
      ipv4_enabled    = false
      private_network = var.vpc_id
    }
  }
}

resource "google_sql_database" "feature_flags" {
  name     = "feature_flags"
  instance = google_sql_database_instance.postgres.name
}

resource "google_sql_user" "app" {
  name     = "app"
  instance = google_sql_database_instance.postgres.name
  password = var.db_password
}
