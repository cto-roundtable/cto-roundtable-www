#!/usr/bin/env bash
# A throwaway preview of the member portal on a copy of production data, and the
# persona e2e against it. See e2e/README.md.
#
#   e2e/preview.sh up [name]        Neon branch of production (expires in 24 h), build, serve on :3311
#   e2e/preview.sh test [args...]   run the persona specs (args go to playwright), then build the report
#   e2e/preview.sh publish          put the report on the artifact shelf (box only)
#   e2e/preview.sh down             stop the server and delete the branch
#   --dry-run                       on up/down: say what would happen, change nothing
#
# Needs NEON_API_KEY (neonctl) and Playwright's Chromium. Never touches the
# production branch except to copy it; e2e/support/guard.ts refuses it as a target.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN="$ROOT/e2e/.run"
ENV_FILE="$RUN/preview.env"
PROJECT="purple-morning-13449512" # Neon "CTO Roundtable"
PARENT="production"
PORT="${E2E_PORT:-3311}"
DRY=0
args=()
for a in "$@"; do [ "$a" = "--dry-run" ] && DRY=1 || args+=("$a"); done
set -- "${args[@]}"
cmd="${1:-}"; shift || true

ok()   { echo "  ok    $*"; }
warn() { echo "  warn  $*"; }
fail() { echo "  FAIL  $*" >&2; exit 1; }
run()  { if [ "$DRY" = 1 ]; then echo "  would: $*" >&2; else "$@"; fi; }
did()  { [ "$DRY" = 1 ] || ok "$@"; }

load_env() {
  [ -f "$ENV_FILE" ] || fail "no preview is up ($ENV_FILE missing). Run: $ROOT/e2e/preview.sh up"
  set -a; . "$ENV_FILE"; set +a
}

case "$cmd" in
up)
  name="preview/${1:-persona-e2e}-$(date -u +%Y%m%d-%H%M)"
  command -v neonctl >/dev/null || fail "neonctl is not installed"
  [ -n "${NEON_API_KEY:-}" ] || fail "NEON_API_KEY is not set"
  mkdir -p "$RUN"
  expires="$(date -u -d '+24 hours' +%Y-%m-%dT%H:%M:%SZ)"
  echo "Branching $PARENT -> $name (expires $expires)"
  run neonctl branches create --project-id "$PROJECT" --parent "$PARENT" --name "$name" --expires-at "$expires" --output json >/dev/null
  if [ "$DRY" = 1 ]; then echo "  would: build, then serve on 0.0.0.0:$PORT with a fresh SESSION_SECRET"; exit 0; fi
  ok "branch $name"
  url="$(neonctl cs "$name" --project-id "$PROJECT" --pooled)"
  case "$url" in postgres*) ;; *) fail "no connection string for $name" ;; esac
  umask 077
  cat > "$ENV_FILE" <<EOF
E2E_BRANCH='$name'
DATABASE_URL='$url'
SESSION_SECRET=$(openssl rand -hex 32)
RESEND_API_KEY=re_preview_dummy
E2E_BASE_URL=http://127.0.0.1:$PORT
EOF
  ok "env written to $ENV_FILE (DATABASE_URL ${#url} chars, a new SESSION_SECRET)"
  echo "Building (nuxt build, a few minutes)"
  (cd "$ROOT" && npx nuxt build >"$RUN/build.log" 2>&1) || fail "build failed, see $RUN/build.log"
  ok "built"
  load_env
  # NUXT_* is what the built server reads. No PostHog token: test traffic stays out of usage analytics.
  # setsid -f detaches it fully, so this script (and whatever pipes it) does not wait on the server.
  cd "$ROOT"
  NUXT_DATABASE_URL="$DATABASE_URL" NUXT_SESSION_SECRET="$SESSION_SECRET" NUXT_RESEND_API_KEY="$RESEND_API_KEY" \
    NUXT_PUBLIC_POSTHOG_TOKEN= HOST=0.0.0.0 PORT="$PORT" \
    setsid -f sh -c 'echo $$ >"$1"; exec node .output/server/index.mjs' sh "$RUN/server.pid" </dev/null >"$RUN/server.log" 2>&1
  for _ in $(seq 1 30); do curl -sf "http://127.0.0.1:$PORT/api/auth/session" >/dev/null && break; sleep 1; done
  curl -sf "http://127.0.0.1:$PORT/api/auth/session" >/dev/null || fail "server did not answer, see $RUN/server.log"
  ok "serving on http://0.0.0.0:$PORT (pid $(cat "$RUN/server.pid"))"
  echo "Next: $ROOT/e2e/preview.sh test"
  ;;
test)
  load_env
  [ -f /workspace/playwright-browsers/env.sh ] && . /workspace/playwright-browsers/env.sh
  status=0
  (cd "$ROOT" && npx playwright test "$@") || status=$?
  (cd "$ROOT" && node e2e/report/build.mjs) || true
  [ "$status" = 0 ] && ok "all specs passed" || warn "specs failed (exit $status); the report shows what ran"
  echo "Report: $RUN/gallery/index.html  (Playwright's own, with traces: npx playwright show-report $RUN/report)"
  echo "Next: $ROOT/e2e/preview.sh publish"
  exit "$status"
  ;;
publish)
  command -v artifact >/dev/null || fail "artifact is not on PATH (box only); open $RUN/gallery/index.html instead"
  base="$(artifact whoami 2>/dev/null | awk '{print $1}' | head -1)"
  (cd "$ROOT" && node e2e/report/build.mjs --link "https://artifacts.go.vongohren.me/${base:-cto-roundtable}/portal-as-{key}") >/dev/null
  for f in "$RUN"/gallery/*.html; do
    key="$(basename "$f" .html)"
    artifact publish "$f" --name "portal-as-$key" --title "Member portal as $key" >/dev/null && ok "portal-as-$key"
  done
  echo "Index: $(artifact url portal-as-index)"
  ;;
down)
  if [ -f "$RUN/server.pid" ]; then run kill "$(cat "$RUN/server.pid")" || true; [ "$DRY" = 1 ] || rm -f "$RUN/server.pid"; did "server stopped"; fi
  if [ -f "$ENV_FILE" ]; then
    load_env
    case "$E2E_BRANCH" in preview/*) ;; *) fail "refusing to delete '$E2E_BRANCH': not a preview/ branch" ;; esac
    run neonctl branches delete "$E2E_BRANCH" --project-id "$PROJECT" >/dev/null
    [ "$DRY" = 1 ] || rm -f "$ENV_FILE"
    did "branch $E2E_BRANCH deleted"
  else
    warn "no $ENV_FILE, so no branch to delete"
  fi
  ;;
*)
  sed -n '2,12p' "$0"; exit 2 ;;
esac
