terraform {
  required_version = ">= 1.6"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
  backend "gcs" {
    bucket = "YOUR_PROJECT_ID-terraform-state"
    prefix = "feature-flag-service/production"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}
