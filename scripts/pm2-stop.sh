#!/usr/bin/env bash
set -euo pipefail

if ! command -v pm2 >/dev/null 2>&1; then
  echo "pm2 未安装，无需停止 PM2 进程。"
  exit 0
fi

pm2 delete algorithm-review-backend algorithm-review-frontend >/dev/null 2>&1 || true
pm2 save >/dev/null 2>&1 || true
