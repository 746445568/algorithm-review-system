#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/load-env.sh"
load_root_env "$SCRIPT_DIR/.."
export PATH="$SCRIPT_DIR/bin:$PATH"
cd "$SCRIPT_DIR/../frontend"
unset npm_config_workspace || true
unset npm_config_workspaces || true
unset NPM_CONFIG_WORKSPACE || true
unset NPM_CONFIG_WORKSPACES || true
rm -rf .next
if command -v script >/dev/null 2>&1; then
  exec script -qec "../node_modules/.bin/next dev -H 0.0.0.0 -p 3000" /dev/null
fi
exec ../node_modules/.bin/next dev -H 0.0.0.0 -p 3000
