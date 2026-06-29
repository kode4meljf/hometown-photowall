#!/usr/bin/env bash
set -euo pipefail

ENV="${WX_CLOUD_ENV:-hometown-photos-d4fm4k2ca299019d}"
CF_ROOT="../miniprogram/cloudfunctions"
cd "$(dirname "$0")/.."

FUNCTIONS=(
  auth
  posts
  feedback
  stats
  signin
  adminApi
  mediaCheckCallback
  cleanupRejectedPosts
)

for fn in "${FUNCTIONS[@]}"; do
  echo "=== Deploying $fn (env: $ENV) ==="
  if [ "$fn" = "adminApi" ]; then
    npx tcb fn deploy adminApi --dir "$CF_ROOT/adminApi" -e "$ENV" --force --yes --path /adminApi
  else
    npx tcb fn deploy "$fn" --dir "$CF_ROOT/$fn" -e "$ENV" --force --yes
  fi
done

echo "=== All cloud functions deployed ==="
