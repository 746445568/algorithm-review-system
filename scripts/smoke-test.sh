#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
. "$ROOT_DIR/scripts/load-env.sh"
load_root_env "$ROOT_DIR"

BACKEND_URL="${BACKEND_ORIGIN:-http://127.0.0.1:3001}"
FRONTEND_URL="${FRONTEND_ORIGIN:-http://127.0.0.1:3000}"

echo "Checking backend health: $BACKEND_URL/api/health"
curl -fsS "$BACKEND_URL/api/health" >/dev/null

echo "Checking frontend entry: $FRONTEND_URL"
curl -fsS "$FRONTEND_URL" >/dev/null

echo "Smoke test passed."
