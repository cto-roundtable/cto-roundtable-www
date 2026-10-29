#!/usr/bin/env bash
# Run tofu for this stack from the cto-roundtable agent box, as
# tofu-runner@cto-roundtable (impersonated; see bootstrap-box-runner.sh).
#
#   box-tofu.sh init
#   box-tofu.sh plan -out=/tmp/<session>-www.plan
#   box-tofu.sh apply /tmp/<session>-www.plan
#
# Any tofu subcommand and flags pass straight through. The access token lives
# one hour and only in this process's environment; nothing is written to disk.
#
# It runs against the checkout it lives in, so call it from a worktree on
# origin/main, never the shared clone (init can rewrite .terraform.lock.hcl).
#
# House rule: apply only a saved plan that has been read, and never a plan
# with a destroy in it without Snorre's yes.
set -euo pipefail

RUNNER="tofu-runner@cto-roundtable.iam.gserviceaccount.com"
DIR="$(cd "$(dirname "$0")" && pwd)"

command -v tofu >/dev/null || { echo "  FAIL  tofu is not on PATH"; exit 1; }
token="$(gcloud auth print-access-token --impersonate-service-account="$RUNNER" 2>/dev/null)" \
  || { echo "  FAIL  cannot impersonate $RUNNER (has bootstrap-box-runner.sh been run?)"; exit 1; }

GOOGLE_OAUTH_ACCESS_TOKEN="$token" exec tofu -chdir="$DIR" "$@"
