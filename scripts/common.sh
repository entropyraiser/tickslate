# Shared helpers for install.sh and uninstall.sh.
# ROOT is set by the caller before this file is sourced.
LABEL="com.tickslate.dashboard"
LEGACY_APP_SUPPORT="${HOME}/Library/Application Support/Tickslate"
LEGACY_PLIST="${HOME}/Library/LaunchAgents/${LABEL}.plist"
LEGACY_LOG_DIR="${HOME}/Library/Logs/Tickslate"
LEGACY_APP="${HOME}/Applications/Tickslate.app"
DEFAULT_PORT="3000"
PID_FILE="${ROOT}/.tickslate.pid"
LOG_FILE="${ROOT}/.tickslate.log"

stop_local_process() {
  if [[ ! -f "$PID_FILE" ]]; then
    return 0
  fi
  local pid=""
  pid="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
    local _
    for _ in 1 2 3 4 5 6 7 8 9 10; do
      if ! kill -0 "$pid" 2>/dev/null; then
        break
      fi
      sleep 0.2
    done
    if kill -0 "$pid" 2>/dev/null; then
      kill -9 "$pid" 2>/dev/null || true
    fi
  fi
  rm -f "$PID_FILE"
}

stop_service() {
  local domain="gui/$(id -u)"
  launchctl bootout "${domain}/${LABEL}" >/dev/null 2>&1 || true
  if [[ -f "$LEGACY_PLIST" ]]; then
    launchctl bootout "${domain}" "$LEGACY_PLIST" >/dev/null 2>&1 || true
  fi
  stop_local_process
}

# Removes the login item and copied files from an earlier install.
remove_legacy_install() {
  if [[ -f "$LEGACY_PLIST" || -d "$LEGACY_APP_SUPPORT" || -d "$LEGACY_LOG_DIR" || -d "$LEGACY_APP" ]]; then
    echo "Removing the previous login item and its files..."
  fi
  rm -f "$LEGACY_PLIST"
  rm -rf "$LEGACY_APP_SUPPORT" "$LEGACY_LOG_DIR"
  remove_legacy_app
}

# Removes the Applications shortcut from an earlier install, and only that app.
remove_legacy_app() {
  local bundle_id=""
  if [[ ! -d "$LEGACY_APP" ]]; then
    return 0
  fi
  bundle_id="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "${LEGACY_APP}/Contents/Info.plist" 2>/dev/null || true)"
  if [[ "$bundle_id" == "$LABEL" ]]; then
    rm -rf "$LEGACY_APP"
    rmdir "${HOME}/Applications" 2>/dev/null || true
  fi
}
