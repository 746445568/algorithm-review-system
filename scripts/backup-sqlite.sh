#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
. "$ROOT_DIR/scripts/load-env.sh"
load_root_env "$ROOT_DIR"
DB_PATH="$(resolve_sqlite_path "$ROOT_DIR")"

BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups}"
mkdir -p "$BACKUP_DIR"

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
TARGET="$BACKUP_DIR/dev-$TIMESTAMP.db"

cp "$DB_PATH" "$TARGET"
echo "SQLite backup created: $TARGET"
