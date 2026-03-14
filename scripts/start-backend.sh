#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
. "$ROOT_DIR/scripts/load-env.sh"
load_root_env "$ROOT_DIR"
cd "$ROOT_DIR/backend"
exec node dist/index.js
