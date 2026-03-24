#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
OUT_DIR="${SERVER_ROOT}/bin"
OUT_NAME="ojreviewd"

VERSION="${VERSION:-$(git -C "${SERVER_ROOT}" describe --tags --always --dirty 2>/dev/null || echo "1.0.0-dev")}"
COMMIT="${COMMIT:-$(git -C "${SERVER_ROOT}" rev-parse --short HEAD 2>/dev/null || echo "dev")}"

mkdir -p "${OUT_DIR}"

GOOS="${GOOS:-}"
GOARCH="${GOARCH:-}"

echo "[build-service] version=${VERSION} commit=${COMMIT}"

if [[ -n "${GOOS}" || -n "${GOARCH}" ]]; then
  env GOOS="${GOOS}" GOARCH="${GOARCH}" go build \
    -ldflags "-X ojreviewdesktop/internal/buildinfo.Version=${VERSION} -X ojreviewdesktop/internal/buildinfo.Commit=${COMMIT}" \
    -o "${OUT_DIR}/${OUT_NAME}" ./cmd/ojreviewd
else
  go build \
    -ldflags "-X ojreviewdesktop/internal/buildinfo.Version=${VERSION} -X ojreviewdesktop/internal/buildinfo.Commit=${COMMIT}" \
    -o "${OUT_DIR}/${OUT_NAME}" ./cmd/ojreviewd
fi

echo "[build-service] built ${OUT_DIR}/${OUT_NAME}"
