# Shared locations for the Tickslate Mac install. Sourced by install.sh and uninstall.sh.
LABEL="com.tickslate.dashboard"
APP_SUPPORT="${HOME}/Library/Application Support/Tickslate"
LAUNCH_AGENTS="${HOME}/Library/LaunchAgents"
PLIST="${LAUNCH_AGENTS}/${LABEL}.plist"
LOG_DIR="${HOME}/Library/Logs/Tickslate"
DEFAULT_PORT="3000"

stop_service() {
  local domain="gui/$(id -u)"
  launchctl bootout "${domain}/${LABEL}" >/dev/null 2>&1 || true
  if [[ -f "$PLIST" ]]; then
    launchctl bootout "${domain}" "$PLIST" >/dev/null 2>&1 || true
  fi
}

# Removes the Applications shortcut from an earlier install, and only that app.
remove_legacy_app() {
  local bundle="${HOME}/Applications/Tickslate.app"
  local bundle_id=""
  if [[ ! -d "$bundle" ]]; then
    return 0
  fi
  bundle_id="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "${bundle}/Contents/Info.plist" 2>/dev/null || true)"
  if [[ "$bundle_id" == "$LABEL" ]]; then
    rm -rf "$bundle"
    rmdir "${HOME}/Applications" 2>/dev/null || true
  fi
}
