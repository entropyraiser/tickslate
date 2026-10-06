#!/usr/bin/env bash
# Stop Tickslate and remove leftovers from an earlier login-item install.
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
remove_legacy_install
rm -f "$LOG_FILE"

echo "Tickslate is stopped. This project folder was not changed."
