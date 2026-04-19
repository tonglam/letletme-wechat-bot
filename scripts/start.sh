#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck disable=SC1091
source "$SCRIPT_DIR/common.sh"

load_env_file
ensure_dirs

if is_running; then
  echo "$APP_NAME already running with PID $(current_pid). Use stop.sh first if you need to restart."
  exit 0
fi

ENTRY_PATH=$(resolve_entrypoint)
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
echo "[$TIMESTAMP] Starting $APP_NAME using $ENTRY_PATH"
nohup "$BUN_CMD" "$ENTRY_PATH" >>"$CONSOLE_LOG" 2>&1 &
PID=$!
echo "$PID" > "$PID_FILE"
chmod 600 "$PID_FILE"
sleep 1
if ps -p "$PID" >/dev/null 2>&1; then
  echo "$APP_NAME started successfully (PID $PID). Logs: $CONSOLE_LOG"
else
  echo "Failed to start $APP_NAME. Check $CONSOLE_LOG for details." >&2
  exit 1
fi
