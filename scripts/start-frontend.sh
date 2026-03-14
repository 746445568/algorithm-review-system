#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/load-env.sh"
load_root_env "$SCRIPT_DIR/.."
export PATH="$SCRIPT_DIR/bin:$PATH"
cd "$SCRIPT_DIR/../frontend"
export PORT="${FRONTEND_PORT:-3000}"
exec ../node_modules/.bin/next start -H 0.0.0.0 -p "$PORT"
