# =============================================================================
# Cloud Run - CTO Roundtable Website (cto-roundtable-www)
#
# Nuxt 4 SSR app with Neon Postgres backend.
# Deployed via `gcloud builds submit` + `gcloud run deploy`.
#
# Global resources (DNS zone, Artifact Registry, project APIs) are in
# ctoroundtable-hq/infrastructure/tofu/
# =============================================================================

# Reference the shared Artifact Registry from HQ
data "google_artifact_registry_repository" "docker" {
  location      = var.region
  repository_id = "ctoroundtable"
}

# -----------------------------------------------------------------------------
# Service account
# -----------------------------------------------------------------------------

resource "google_service_account" "www" {
  account_id   = "www-cloudrun"
  display_name = "Cloud Run - www"
  description  = "Service account for cto-roundtable-www Cloud Run service"
}

# -----------------------------------------------------------------------------
# Secrets (shells only — values managed via gcloud CLI)
#
#   gcloud secrets versions add www-database-url --data-file=-
#   gcloud secrets versions add www-posthog-token --data-file=-
# -----------------------------------------------------------------------------

resource "google_secret_manager_secret" "database_url" {
  secret_id = "www-database-url"
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret" "posthog_token" {
  secret_id = "www-posthog-token"
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret" "resend_api_key" {
  secret_id = "www-resend-api-key"
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret" "session_secret" {
  secret_id = "www-session-secret"
  replication {
    auto {}
  }
}

# Grant the service account access to secrets
resource "google_secret_manager_secret_iam_member" "database_url" {
  secret_id = google_secret_manager_secret.database_url.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.www.email}"
}

resource "google_secret_manager_secret_iam_member" "posthog_token" {
  secret_id = google_secret_manager_secret.posthog_token.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.www.email}"
}

resource "google_secret_manager_secret_iam_member" "resend_api_key" {
  secret_id = google_secret_manager_secret.resend_api_key.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.www.email}"
}

resource "google_secret_manager_secret_iam_member" "session_secret" {
  secret_id = google_secret_manager_secret.session_secret.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.www.email}"
}

# -----------------------------------------------------------------------------
# Cloud Run service
# -----------------------------------------------------------------------------

resource "google_cloud_run_v2_service" "www" {
  name     = "cto-roundtable-www"
  location = var.region

  template {
    service_account = google_service_account.www.email

    scaling {
      min_instance_count = 0
      max_instance_count = 2
    }

    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/${data.google_artifact_registry_repository.docker.repository_id}/www:latest"

      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        cpu_idle = true # Scale to zero
      }

      env {
        name  = "NODE_ENV"
        value = "production"
      }

      env {
        name  = "NUXT_POSTHOG_HOST"
        value = "https://eu.i.posthog.com"
      }

      env {
        name = "NUXT_DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.database_url.secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "NUXT_PUBLIC_POSTHOG_TOKEN"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.posthog_token.secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "NUXT_RESEND_API_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.resend_api_key.secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "NUXT_SESSION_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.session_secret.secret_id
            version = "latest"
          }
        }
      }
    }
  }

  depends_on = [
    google_secret_manager_secret.database_url,
    google_secret_manager_secret.posthog_token,
    google_secret_manager_secret.resend_api_key,
    google_secret_manager_secret.session_secret,
  ]
}

# Allow unauthenticated access (public website)
resource "google_cloud_run_v2_service_iam_member" "public" {
  name     = google_cloud_run_v2_service.www.name
  location = google_cloud_run_v2_service.www.location
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# -----------------------------------------------------------------------------
# Domain mapping (ctoroundtable.no → Cloud Run)
# Google-managed SSL certificate, auto-renewed.
# DNS records pointing here are managed in HQ tofu (dns.tf).
# -----------------------------------------------------------------------------

resource "google_cloud_run_domain_mapping" "root" {
  name     = var.domain
  location = var.region

  metadata {
    namespace = var.project_id
  }

  spec {
    route_name = google_cloud_run_v2_service.www.name
  }
}

resource "google_cloud_run_domain_mapping" "www" {
  name     = "www.${var.domain}"
  location = var.region

  metadata {
    namespace = var.project_id
  }

  spec {
    route_name = google_cloud_run_v2_service.www.name
  }
}

# -----------------------------------------------------------------------------
# Cloud Build - CI/CD pipeline (GitHub → build → deploy)
# -----------------------------------------------------------------------------

resource "google_cloudbuild_trigger" "www_deploy" {
  name        = "www-deploy-on-push"
  description = "Build and deploy www to Cloud Run on push to main"
  location    = var.region

  github {
    owner = "cto-roundtable"
    name  = "cto-roundtable-www"

    push {
      branch = "^main$"
    }
  }

  filename = "cloudbuild.yaml"

  service_account = "projects/${var.project_id}/serviceAccounts/${google_service_account.www_cloudbuild.email}"

  depends_on = [google_project_iam_member.cloudbuild_run_admin]
}

# Dedicated service account for Cloud Build deployments
resource "google_service_account" "www_cloudbuild" {
  account_id   = "www-cloudbuild"
  display_name = "Cloud Build - www deploy"
  description  = "Service account for Cloud Build www CI/CD pipeline"
}

# Cloud Build SA needs to deploy to Cloud Run
resource "google_project_iam_member" "cloudbuild_run_admin" {
  project = var.project_id
  role    = "roles/run.admin"
  member  = "serviceAccount:${google_service_account.www_cloudbuild.email}"
}

# Cloud Build SA needs to push/pull images from Artifact Registry
resource "google_project_iam_member" "cloudbuild_ar_writer" {
  project = var.project_id
  role    = "roles/artifactregistry.writer"
  member  = "serviceAccount:${google_service_account.www_cloudbuild.email}"
}

# Cloud Build SA needs to act as the Cloud Run service account
resource "google_service_account_iam_member" "cloudbuild_acts_as_www" {
  service_account_id = google_service_account.www.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.www_cloudbuild.email}"
}

# Cloud Build SA needs logging permissions
resource "google_project_iam_member" "cloudbuild_logs" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.www_cloudbuild.email}"
}

# -----------------------------------------------------------------------------
# Outputs
# -----------------------------------------------------------------------------

output "url" {
  description = "Cloud Run URL for the website"
  value       = google_cloud_run_v2_service.www.uri
}

output "docker_image" {
  description = "Full Docker image path"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${data.google_artifact_registry_repository.docker.repository_id}/www:latest"
}
