#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DESKTOP_DIR="${ROOT_DIR}/apps/desktop-electron"
SERVER_DIR="${ROOT_DIR}/apps/server"
OUTPUT_BIN="${DESKTOP_DIR}/bin/ojreviewd"
MIN_NODE_MAJOR=18
SKIP_INSTALL=false
RELEASE_VERSION=""

usage() {
  cat <<'USAGE'
Usage: bash ./scripts/release-desktop-v1.sh [--skip-install] [--version <x.y.z>]

Options:
  --skip-install      Skip npm ci in apps/desktop-electron.
  --version <x.y.z>   Override desktop package version before dist.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-install)
      SKIP_INSTALL=true
      shift
      ;;
    --version)
      RELEASE_VERSION="${2:-}"
      if [[ -z "${RELEASE_VERSION}" ]]; then
        echo "[release] --version requires a value"
        exit 1
      fi
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "[release] Unknown argument: $1"
      usage
      exit 1
      ;;
  esac
done

if ! command -v node >/dev/null 2>&1; then
  echo "[release] node is required"
  exit 1
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if (( NODE_MAJOR < MIN_NODE_MAJOR )); then
  echo "[release] Node.js >= ${MIN_NODE_MAJOR} is required, current: $(node -v)"
  exit 1
fi

echo "[release] Node version check passed: $(node -v)"

if [[ "${SKIP_INSTALL}" != true ]]; then
  echo "[release] Installing desktop dependencies with npm ci"
  (
    cd "${DESKTOP_DIR}"
    npm ci
  )
else
  echo "[release] Skip install enabled"
fi

if [[ -n "${RELEASE_VERSION}" ]]; then
  echo "[release] Setting desktop version to ${RELEASE_VERSION}"
  (
    cd "${DESKTOP_DIR}"
    npm version "${RELEASE_VERSION}" --no-git-tag-version
  )
fi

echo "[release] Building ojreviewd"
(
  cd "${SERVER_DIR}"
  GOOS=windows GOARCH=amd64 go build -o "${OUTPUT_BIN}.exe" ./cmd/ojreviewd
)

echo "[release] Ensuring non-windows helper binary path"
cp -f "${OUTPUT_BIN}.exe" "${OUTPUT_BIN}" || true

echo "[release] Running desktop dist"
(
  cd "${DESKTOP_DIR}"
  npm run dist
)

echo "[release] Desktop V1 release build completed"
