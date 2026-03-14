#!/usr/bin/env bash

load_root_env() {
  local root_dir="$1"
  local env_file="$root_dir/.env"

  if [[ ! -f "$env_file" ]]; then
    return 0
  fi

  set -a
  # shellcheck disable=SC1090
  source <(sed '1s/^\xEF\xBB\xBF//' "$env_file" | tr -d '\r')
  set +a
}

resolve_sqlite_path() {
  local root_dir="$1"
  local database_url_value="${DATABASE_URL:-file:./dev.db}"
  local db_path="${database_url_value#file:}"

  if [[ "$db_path" == /* ]]; then
    printf '%s\n' "$db_path"
    return 0
  fi

  if [[ -f "$root_dir/$db_path" ]]; then
    printf '%s\n' "$root_dir/$db_path"
    return 0
  fi

  printf '%s\n' "$root_dir/prisma/${db_path#./}"
}
