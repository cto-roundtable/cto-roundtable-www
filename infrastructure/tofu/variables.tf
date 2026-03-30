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
