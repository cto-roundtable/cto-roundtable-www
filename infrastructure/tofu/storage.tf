# =============================================================================
# Object storage - Investor updates (raw emails + attachments)
#
# Backs the cohort-scoped /member/updates page. The triage-investment-mail skill
# writes, at ingest, per portfolio-company update:
#   updates/<message_id>/raw.eml        <- immutable TRUE SOURCE of the update
#   updates/<message_id>/<attachment>   <- original attachments (xlsx, decks, ...)
# Metadata + the cleaned body live in Neon (investor_updates{,_attachments}).
#
# EU region on purpose: the Neon DB is in aws-eu-central-1 and the portal runs in
# europe-north1. Neon's own object storage (buckets) is beta + us-east-2-only, so
# it is NOT used here — it would exile the source-of-record founder emails to the
# US. Revisit Neon buckets when it is GA with an EU region.
#
# Serving model: the portal reads objects with objectViewer and STREAMS them to
# the member after a cohort check (proxy). No public access, no signed URLs, no
# long-lived shareable links — access is re-checked on every request.
# =============================================================================

resource "google_storage_bucket" "investor_updates" {
  name     = "cto-roundtable-investor-updates"
  location = "EUROPE-NORTH1"

  # Private only. Access is via the Cloud Run SA + a portal cohort check.
  public_access_prevention    = "enforced"
  uniform_bucket_level_access = true

  # The raw email is a source-of-record: keep prior versions so an overwrite or a
  # buggy ingest can never destroy the original.
  versioning {
    enabled = true
  }

  # Defence in depth: even a compromised writer cannot hard-delete history within
  # the retention window.
  soft_delete_policy {
    retention_duration_seconds = 7776000 # 90 days
  }

  labels = {
    app     = "cto-roundtable-www"
    purpose = "investor-updates"
  }
}

# The portal (Cloud Run) reads objects to stream them to authorised members.
resource "google_storage_bucket_iam_member" "www_reader" {
  bucket = google_storage_bucket.investor_updates.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.www.email}"
}

# -----------------------------------------------------------------------------
# Writer identity for ingest (the triage-investment-mail skill).
#
# The skill runs from an operator's machine. It can either (a) use this dedicated
# writer SA via a downloaded key, or (b) upload under the operator's own gcloud
# identity (an owner/editor). The SA is provided so ingest can be automated later
# (e.g. a Cloud Run job) with least privilege — objectAdmin on THIS bucket only.
# -----------------------------------------------------------------------------

resource "google_service_account" "investor_updates_writer" {
  account_id   = "investor-updates-writer"
  display_name = "Investor updates ingest writer"
  description  = "Writes raw emails + attachments to the investor-updates bucket (triage-investment-mail)."
}

resource "google_storage_bucket_iam_member" "writer_objectadmin" {
  bucket = google_storage_bucket.investor_updates.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.investor_updates_writer.email}"
}

output "investor_updates_bucket" {
  description = "GCS bucket holding raw investor-update emails + attachments"
  value       = google_storage_bucket.investor_updates.name
}

# =============================================================================
# Object storage - Styreprotokoller (signed board minutes)
#
# Backs /member/board, styret-gated. The portal WRITES here, which is the
# difference from the investor-updates bucket above: issuing a protocol renders
# a PDF and stores it, so the Cloud Run SA needs objectAdmin, not objectViewer.
#
#   protocols/<meeting-slug>/v<n>/protokoll.pdf          <- generated, immutable
#   protocols/<meeting-slug>/v<n>/protokoll-signert.pdf  <- signed rendition
#
# A separate bucket rather than a prefix in investor-updates, for two reasons:
# these are permanent records of the association with a different lifetime, and
# the investor-updates ingest identity holds objectAdmin on that bucket and has
# no business near board papers.
#
# Serving model is identical: private, no signed URLs, streamed to the member
# after requireBoard() re-checks membership on every request.
#
# No locked retention policy on purpose. A retention lock would also prevent us
# from removing a protocol issued in error, and the protection we actually want
# (history cannot be quietly destroyed) is what versioning + soft delete give.
# =============================================================================

resource "google_storage_bucket" "board_protocols" {
  name     = "cto-roundtable-board-protocols"
  location = "EUROPE-NORTH1"

  public_access_prevention    = "enforced"
  uniform_bucket_level_access = true

  versioning {
    enabled = true
  }

  soft_delete_policy {
    retention_duration_seconds = 7776000 # 90 days
  }

  labels = {
    app     = "cto-roundtable-www"
    purpose = "board-protocols"
  }
}

# The portal both writes issued protocols and reads them back to serve them.
resource "google_storage_bucket_iam_member" "www_board_protocols_admin" {
  bucket = google_storage_bucket.board_protocols.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.www.email}"
}

output "board_protocols_bucket" {
  description = "GCS bucket holding issued styreprotokoller (generated + signed PDFs)"
  value       = google_storage_bucket.board_protocols.name
}
