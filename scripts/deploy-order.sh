#!/usr/bin/env bash
# Should this Cloud Build deploy, or would it roll production back? (cloudbuild.yaml)
#
#   scripts/deploy-order.sh <this build's start, epoch s> <live service's build-started label, or "">
#   exit 0  deploy: nothing live is newer than this build
#   exit 10 skip:   the live revision came from a build that started after this one
#   exit 2  usage
#
# Why: two merges 21 s apart on 2026-11-25 (#115 at 15:20:40, #116 at 15:21:01) started two
# builds. #116's finished first (15:24:48) and deployed; #115's, of the OLDER commit, finished
# at 15:25:18 and deployed over it, so production ran without #116 (the portal visit log) and
# nobody saw it until the log stayed empty. Builds start in push order, so the start time
# orders them; whichever finishes last must not win if it started first.
set -uo pipefail
mine="${1:-}"
live="${2:-}"
num='^[0-9]+$'
[[ "$mine" =~ $num ]] || { echo "usage: $0 <build start epoch> <live build-started label or empty>" >&2; exit 2; }
if [[ -z "$live" ]]; then
  echo "deploy: the live service has no build-started label (deployed before this guard)"
  exit 0
fi
if ! [[ "$live" =~ $num ]]; then
  echo "deploy: the live build-started label '$live' is not a number, ignoring it"
  exit 0
fi
if (( live > mine )); then
  echo "skip: the live revision is from a build started at $live, after this build ($mine). Deploying would roll production back."
  exit 10
fi
echo "deploy: this build ($mine) started at or after the live one ($live)"
exit 0
