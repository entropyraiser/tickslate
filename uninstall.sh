#!/usr/bin/env bash
# Stop Tickslate and remove the copy installed for this Mac user.
# The project folder is left as it is.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/common.sh
source "${ROOT}/scripts/common.sh"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This uninstaller is for macOS." >&2
  exit 1
fi

echo "Stopping Tickslate..."
stop_service

if [[ -f "$PLIST" ]]; then
  rm -f "$PLIST"
  echo "Removed ${PLIST}"
fi

if [[ -d "$APP_SUPPORT" ]]; then
  rm -rf "$APP_SUPPORT"
  echo "Removed ${APP_SUPPORT}"
fi

if [[ -d "$LOG_DIR" ]]; then
  rm -rf "$LOG_DIR"
  echo "Removed ${LOG_DIR}"
fi

remove_legacy_app

echo "Tickslate is uninstalled. This project folder was not changed."
