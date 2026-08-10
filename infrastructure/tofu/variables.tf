variable "project_id" {
  description = "GCP project ID"
  type        = string
  default     = "cto-roundtable"
}

variable "region" {
  description = "Default GCP region"
  type        = string
  default     = "europe-north1"
}

variable "domain" {
  description = "Primary domain"
  type        = string
  default     = "ctoroundtable.no"
}

variable "image_tag" {
  description = <<-EOT
    Artifact Registry tag for the www container image. Cloud Build
    (cloudbuild.yaml) deploys the running revision as www:$COMMIT_SHA on every
    push to main and is the source of truth for the live image. This variable is
    only the tag tofu uses to CREATE the service the first time — pass a real,
    already-pushed SHA at bootstrap (`-var image_tag=<sha>`). After creation the
    Cloud Run resource ignores image drift (see lifecycle.ignore_changes), so
    tofu never reverts Cloud Build's deploys. It must reference a tag that
    actually exists — Cloud Build never pushes ":latest".
  EOT
  type        = string
  default     = "latest"
}
