#!/usr/bin/env bash
# One-time: let the cto-roundtable agent box run tofu for this project.
#
# Creates the service account tofu-runner@cto-roundtable, gives it owner on the
# project and write on the shared state bucket, and lets the box's own service
# account impersonate it. After this, box-tofu.sh runs plan/apply with no human
# credentials on the box.
#
# Done 2026-10-29 (Snorre ran it on beast). Kept to recreate the setup.
# Run it ONCE with an owner's gcloud login (CLOUDSDK_CONFIG pointing at a
# config that holds that login). Idempotent: every step checks first.
#
#   bootstrap-box-runner.sh --dry-run   # say what it would do, change nothing
#   bootstrap-box-runner.sh             # do it
set -euo pipefail

PROJECT="cto-roundtable"
RUNNER_ID="tofu-runner"
RUNNER="${RUNNER_ID}@${PROJECT}.iam.gserviceaccount.com"
BOX_SA="cto-roundtable-box@personal-projects-252620.iam.gserviceaccount.com"
STATE_BUCKET="ctoroundtable-tofu-state"
ROLES=("roles/owner")

DRY=0
[ "${1:-}" = "--dry-run" ] && DRY=1

ok()   { echo "  ok    $*"; }
would(){ echo "  would $*"; }
fail() { echo "  FAIL  $*"; exit 1; }

who="$(gcloud config get-value account 2>/dev/null || true)"
[ -n "$who" ] || fail "no gcloud account in this config (CLOUDSDK_CONFIG=${CLOUDSDK_CONFIG:-default})"
echo "as $who, project $PROJECT$([ $DRY = 1 ] && echo ', DRY RUN')"

# 1. The runner service account
if gcloud iam service-accounts describe "$RUNNER" --project "$PROJECT" >/dev/null 2>&1; then
  ok "service account $RUNNER exists"
elif [ $DRY = 1 ]; then
  would "create service account $RUNNER"
else
  gcloud iam service-accounts create "$RUNNER_ID" --project "$PROJECT" \
    --display-name "tofu runner (agent box)" \
    --description "Runs tofu plan/apply for www and hq from the cto-roundtable agent box, via impersonation" >/dev/null
  ok "created service account $RUNNER"
fi

# 2. Project roles for the runner
policy="$(gcloud projects get-iam-policy "$PROJECT" --format=json)"
for role in "${ROLES[@]}"; do
  if printf '%s' "$policy" | python3 -c 'import json,sys;p=json.load(sys.stdin);r,m=sys.argv[1],sys.argv[2];sys.exit(0 if any(b["role"]==r and m in b.get("members",[]) for b in p.get("bindings",[])) else 1)' "$role" "serviceAccount:$RUNNER"; then
    ok "$RUNNER has $role on $PROJECT"
  elif [ $DRY = 1 ]; then
    would "grant $role on $PROJECT to $RUNNER"
  else
    gcloud projects add-iam-policy-binding "$PROJECT" --member "serviceAccount:$RUNNER" --role "$role" --condition=None >/dev/null
    ok "granted $role on $PROJECT to $RUNNER"
  fi
done

# 3. The state bucket (it may live outside the project, so grant on the bucket)
if gcloud storage buckets get-iam-policy "gs://$STATE_BUCKET" --format=json 2>/dev/null \
   | python3 -c 'import json,sys;p=json.load(sys.stdin);m=sys.argv[1];sys.exit(0 if any(b["role"]=="roles/storage.objectAdmin" and m in b.get("members",[]) for b in p.get("bindings",[])) else 1)' "serviceAccount:$RUNNER"; then
  ok "$RUNNER has objectAdmin on gs://$STATE_BUCKET"
elif [ $DRY = 1 ]; then
  would "grant roles/storage.objectAdmin on gs://$STATE_BUCKET to $RUNNER"
else
  gcloud storage buckets add-iam-policy-binding "gs://$STATE_BUCKET" --member "serviceAccount:$RUNNER" --role roles/storage.objectAdmin >/dev/null
  ok "granted roles/storage.objectAdmin on gs://$STATE_BUCKET to $RUNNER"
fi

# 4. The box may impersonate the runner (and nothing else)
if gcloud iam service-accounts get-iam-policy "$RUNNER" --project "$PROJECT" --format=json 2>/dev/null \
   | python3 -c 'import json,sys;p=json.load(sys.stdin);m=sys.argv[1];sys.exit(0 if any(b["role"]=="roles/iam.serviceAccountTokenCreator" and m in b.get("members",[]) for b in p.get("bindings",[])) else 1)' "serviceAccount:$BOX_SA"; then
  ok "$BOX_SA can impersonate $RUNNER"
elif [ $DRY = 1 ]; then
  would "grant roles/iam.serviceAccountTokenCreator on $RUNNER to $BOX_SA"
else
  gcloud iam service-accounts add-iam-policy-binding "$RUNNER" --project "$PROJECT" \
    --member "serviceAccount:$BOX_SA" --role roles/iam.serviceAccountTokenCreator >/dev/null
  ok "granted roles/iam.serviceAccountTokenCreator on $RUNNER to $BOX_SA"
fi

echo "done. Next, from the box: $(cd "$(dirname "$0")" && pwd)/box-tofu.sh plan"
