terraform {
  backend "gcs" {
    bucket = "ctoroundtable-tofu-state"
    prefix = "services/www"
  }
}
