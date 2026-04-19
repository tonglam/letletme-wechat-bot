#!/usr/bin/env bash
set -euo pipefail

APP_NAME=${APP_NAME:-letletme-wechat-bot}
APP_HOME=${APP_HOME:-/home/workspace/letletme-wechat-bot}
DIST_DIR=${DIST_DIR:-"$APP_HOME/dist"}
LOG_DIR=${LOG_DIR:-"$APP_HOME/logs"}
RUN_DIR=${RUN_DIR:-"$APP_HOME/run"}
PID_FILE=${PID_FILE:-"$RUN_DIR/$APP_NAME.pid"}
CONSOLE_LOG=${CONSOLE_LOG:-"$LOG_DIR/console.log"}
ENV_FILE=${ENV_FILE:-"$APP_HOME/.env"}
BUN_CMD=${BUN_CMD:-bun}
ENTRYPOINT=${ENTRYPOINT:-"$DIST_DIR/index.js"}

ensure_dirs() {
  mkdir -p "$DIST_DIR" "$LOG_DIR" "$RUN_DIR"
}

load_env_file() {
  if [[ -f "$ENV_FILE" ]]; then
    # shellcheck disable=SC1090
    set -a
    source "$ENV_FILE"
    set +a
  fi
}

is_running() {
  if [[ -f "$PID_FILE" ]]; then
    local pid
    pid=$(cat "$PID_FILE")
    if [[ -n "$pid" ]] && ps -p "$pid" >/dev/null 2>&1; then
      return 0
    fi
  fi
  return 1
}

current_pid() {
  if [[ -f "$PID_FILE" ]]; then
    cat "$PID_FILE"
  fi
}

resolve_entrypoint() {
  if [[ ! -f "$ENTRYPOINT" ]]; then
    echo "No entrypoint found at $ENTRYPOINT. Build or upload the artifact first." >&2
    return 1
  fi
  echo "$ENTRYPOINT"
}

print_status() {
  if is_running; then
    echo "$APP_NAME is running with PID $(current_pid)"
  else
    echo "$APP_NAME is not running"
  fi
}
