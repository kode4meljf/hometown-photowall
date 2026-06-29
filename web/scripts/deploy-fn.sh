#!/usr/bin/env bash
set -euo pipefail

FN="${1:-}"
if [ -z "$FN" ]; then
  echo "用法: npm run deploy:fn -- <函数名>"
  echo "示例: npm run deploy:fn -- auth"
  echo "可选: auth posts feedback stats signin adminApi mediaCheckCallback cleanupRejectedPosts"
  exit 1
fi

ENV="${WX_CLOUD_ENV:-hometown-photos-d4fm4k2ca299019d}"
CF_ROOT="../miniprogram/cloudfunctions"
cd "$(dirname "$0")/.."

if [ ! -f "$CF_ROOT/$FN/index.js" ]; then
  echo "未找到云函数: $CF_ROOT/$FN"
  exit 1
fi

echo "=== Deploying $FN (env: $ENV) ==="
if [ "$FN" = "adminApi" ]; then
  npx tcb fn deploy adminApi --dir "$CF_ROOT/adminApi" -e "$ENV" --force --yes --path /adminApi
else
  npx tcb fn deploy "$FN" --dir "$CF_ROOT/$FN" -e "$ENV" --force --yes
fi

echo "=== $FN deployed ==="
