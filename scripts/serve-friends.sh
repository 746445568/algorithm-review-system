#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

cd "$ROOT_DIR"
bash "$ROOT_DIR/scripts/kill-ports.sh"
npm run build
bash "$ROOT_DIR/scripts/pm2-start.sh"

cat <<'EOF'

本机服务已进入准生产模式：
- 前端: http://127.0.0.1:3000
- 后端: http://127.0.0.1:3001

下一步：
1. 用 cloudflared 暴露 http://127.0.0.1:3000
2. 把外部 HTTPS 地址写入 .env 的 CODEFORCES_OIDC_REDIRECT_URI
3. 在 Codeforces OAuth 应用里同步更新同一个回调地址

EOF
