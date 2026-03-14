#!/usr/bin/env bash
set -euo pipefail

ports=(3000 3001)

if command -v fuser >/dev/null 2>&1; then
  for port in "${ports[@]}"; do
    fuser -k "${port}/tcp" >/dev/null 2>&1 || true
  done
  exit 0
fi

if command -v lsof >/dev/null 2>&1; then
  for port in "${ports[@]}"; do
    pids="$(lsof -ti :"$port" 2>/dev/null || true)"
    if [[ -n "$pids" ]]; then
      kill -9 $pids >/dev/null 2>&1 || true
    fi
  done
fi
