#!/usr/bin/env bash
# The deploy step of cloudbuild.yaml: deploy this build's image to Cloud Run unless a build
# that started later is already live, then check that it stayed live.
#
#   scripts/cloudbuild-deploy.sh <image> <commit sha> <build start, epoch s>
#
# Every deploy labels the service build-started=<epoch> and commit-sha=<sha>. Before
# deploying, scripts/deploy-order.sh compares this build's start with the live label and
# skips (exit 0, logged) when the live one is newer: on 2026-11-25 #115's build of the older
# commit finished 30 s after #116's and rolled production back, unnoticed until the next day.
# After deploying it waits DEPLOY_VERIFY_WAIT seconds (default 30) and reads the label
# again; if an older build got in between the check and its own deploy, it deploys once
# more, and fails the build (a red check on the commit) if it is still not live.
#
# A deliberate rollback is therefore not a Cloud Build retry of an old commit any more:
# use `gcloud run services update-traffic` or a manual `gcloud run deploy` (see CLAUDE.md).
set -uo pipefail
image="${1:?image}"
commit="${2:?commit sha}"
mine="${3:?build start epoch}"
SERVICE="${SERVICE:-cto-roundtable-www}"
REGION="${REGION:-europe-north1}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

live_label() {
  gcloud run services describe "$SERVICE" --region "$REGION" --format='value(metadata.labels.build-started)' 2>/dev/null || true
}

deploy() {
  # --min-instances 1 keeps the Slack ingest webhook warm (Slack needs a <3s ack).
  # --update-secrets adds the activity-ingest secrets without touching the existing
  # bindings (database-url, posthog-token, resend-api-key, session-secret).
  # NUXT_SITE_URL is the canonical origin for magic-link URLs (never the Host header).
  gcloud run deploy "$SERVICE" \
    --image "$image" \
    --region "$REGION" \
    --min-instances 1 \
    --update-env-vars NUXT_SITE_URL=https://www.ctoroundtable.no \
    --update-secrets NUXT_SLACK_SIGNING_SECRET=www-slack-signing-secret:latest,NUXT_INGEST_API_KEY=www-ingest-api-key:latest \
    --update-labels "build-started=$mine,commit-sha=$commit"
}

echo "build of $commit started at $mine"
bash "$here/deploy-order.sh" "$mine" "$(live_label)"
case $? in
  0) ;;
  10) exit 0 ;;
  *) echo "FAIL  deploy-order.sh could not decide" >&2; exit 1 ;;
esac

for attempt in 1 2; do
  deploy || { echo "FAIL  gcloud run deploy (attempt $attempt)" >&2; exit 1; }
  sleep "${DEPLOY_VERIFY_WAIT:-30}"
  now="$(live_label)"
  if [[ "$now" == "$mine" ]]; then
    echo "ok    $commit is live (build-started=$mine)"
    exit 0
  fi
  if [[ "$now" =~ ^[0-9]+$ ]] && (( now > mine )); then
    echo "ok    a newer build ($now) is live now, which is right"
    exit 0
  fi
  echo "warn  an older build (build-started=${now:-none}) overwrote this deploy; deploying again"
done
echo "FAIL  $commit is still not live after two deploys (live build-started=${now:-none})" >&2
exit 1
