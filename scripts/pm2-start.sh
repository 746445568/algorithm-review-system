#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

if ! command -v pm2 >/dev/null 2>&1; then
  echo "pm2 未安装。请先执行: npm install -g pm2" >&2
  exit 1
fi

mkdir -p "$ROOT_DIR/logs"
bash "$ROOT_DIR/scripts/kill-ports.sh"
pm2 delete algorithm-review-backend algorithm-review-frontend >/dev/null 2>&1 || true
pm2 start "$ROOT_DIR/ecosystem.config.cjs"
pm2 save
pm2 status
