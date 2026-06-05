#!/usr/bin/env bash
# 增量上传 posts 云函数（避免全量 deploy 的 EISDIR）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLI="${WX_CLI:-/Applications/wechatwebdevtools.app/Contents/MacOS/cli}"
PROJ="$ROOT/miniprogram"
ENV="${WX_CLOUD_ENV:-cloud1-d2g545zl57f7db2de}"
FILE="${1:-index.js}"
"$CLI" cloud functions inc-deploy --env "$ENV" --name posts --file "$FILE" --project "$PROJ"
# 若未指定参数，默认同时上传 index.js 与 common/contentSecurity.js
if [[ "$FILE" == "index.js" ]]; then
  "$CLI" cloud functions inc-deploy --env "$ENV" --name posts --file common/contentSecurity.js --project "$PROJ"
fi
