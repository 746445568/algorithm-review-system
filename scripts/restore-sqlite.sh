#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: bash ./scripts/restore-sqlite.sh /path/to/backup.db"
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
. "$ROOT_DIR/scripts/load-env.sh"
load_root_env "$ROOT_DIR"
DB_PATH="$(resolve_sqlite_path "$ROOT_DIR")"

SOURCE_PATH="$1"
cp "$SOURCE_PATH" "$DB_PATH"
echo "SQLite database restored to: $DB_PATH"
