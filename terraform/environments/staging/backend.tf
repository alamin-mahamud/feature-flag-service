terraform {
  required_version = ">= 1.6"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
  backend "gcs" {
    bucket = "feature-flag-499220-tfstate"
    prefix = "feature-flag-service/staging"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}
