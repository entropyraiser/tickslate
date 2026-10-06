#!/usr/bin/env bash
# Build Tickslate and install it for this Mac user.
# It starts at login and is available at http://127.0.0.1:3000
# Override the port with PORT=4000 ./install.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/common.sh
source "${ROOT}/scripts/common.sh"

PORT="${PORT:-$DEFAULT_PORT}"
HOST="127.0.0.1"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This installer is for macOS." >&2
  exit 1
fi

if [[ ! "$PORT" =~ ^[0-9]+$ ]] || [[ "$PORT" -lt 1 ]] || [[ "$PORT" -gt 65535 ]]; then
  echo "PORT must be a number from 1 to 65535." >&2
  exit 1
fi

if [[ -d /opt/homebrew/bin ]]; then
  export PATH="/opt/homebrew/bin:${PATH}"
elif [[ -d /usr/local/bin ]]; then
  export PATH="/usr/local/bin:${PATH}"
fi

if ! command -v node >/dev/null 2>&1; then
  if ! command -v brew >/dev/null 2>&1; then
    echo "Node.js is not installed. Install it from https://nodejs.org or with Homebrew, then run ./install.sh again." >&2
    exit 1
  fi
  echo "Installing Node.js with Homebrew..."
  brew install node
fi

NODE="$(command -v node)"
NODE_MAJOR="$("$NODE" -p "process.versions.node.split('.')[0]")"
if [[ "$NODE_MAJOR" -lt 20 ]]; then
  echo "Tickslate needs Node.js 20 or newer. This machine has $("$NODE" -v)." >&2
  exit 1
fi

echo "Using $("$NODE" -v) at ${NODE}"

port_in_use() {
  lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1
}

echo "Stopping a previous Tickslate service, if one is running..."
stop_service

for _ in 1 2 3 4 5 6 7 8 9 10; do
  if ! port_in_use; then
    break
  fi
  sleep 0.3
done

if port_in_use; then
  echo "Port ${PORT} is already in use:" >&2
  lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >&2 || true
  echo "Stop that program, or choose another port: PORT=4000 ./install.sh" >&2
  exit 1
fi

cd "$ROOT"
echo "Installing dependencies..."
npm ci
echo "Building Tickslate..."
npm run build

server_js=""
while IFS= read -r candidate; do
  server_js="$candidate"
  break
done < <(find "${ROOT}/.next/standalone" -type f -name server.js)

if [[ -z "$server_js" ]]; then
  echo "The build did not produce a standalone server." >&2
  exit 1
fi

server_dir="$(dirname "$server_js")"
mkdir -p "${server_dir}/.next"
rm -rf "${server_dir}/public" "${server_dir}/.next/static"
if [[ -d "${ROOT}/public" ]]; then
  cp -R "${ROOT}/public" "${server_dir}/public"
fi
cp -R "${ROOT}/.next/static" "${server_dir}/.next/static"

echo "Installing to ${APP_SUPPORT}"
mkdir -p "$APP_SUPPORT" "$LOG_DIR" "$LAUNCH_AGENTS"
rsync -aL --delete "${server_dir}/" "${APP_SUPPORT}/"
remove_legacy_app

: > "${LOG_DIR}/tickslate.log"
: > "${LOG_DIR}/tickslate.err.log"

LABEL="$LABEL" PLIST="$PLIST" NODE="$NODE" APP_SUPPORT="$APP_SUPPORT" \
  LOG_DIR="$LOG_DIR" PORT="$PORT" HOST="$HOST" \
  python3 - <<'PY'
import os
import plistlib

node_dir = os.path.dirname(os.environ["NODE"])
plist = {
    "Label": os.environ["LABEL"],
    "ProgramArguments": [os.environ["NODE"], os.path.join(os.environ["APP_SUPPORT"], "server.js")],
    "WorkingDirectory": os.environ["APP_SUPPORT"],
    "RunAtLoad": True,
    "KeepAlive": True,
    "ProcessType": "Background",
    "ThrottleInterval": 10,
    "StandardOutPath": os.path.join(os.environ["LOG_DIR"], "tickslate.log"),
    "StandardErrorPath": os.path.join(os.environ["LOG_DIR"], "tickslate.err.log"),
    "EnvironmentVariables": {
        "PORT": os.environ["PORT"],
        "HOSTNAME": os.environ["HOST"],
        "NODE_ENV": "production",
        "PATH": node_dir + ":/usr/bin:/bin:/usr/sbin:/sbin",
    },
}
with open(os.environ["PLIST"], "wb") as handle:
    plistlib.dump(plist, handle)
PY

domain="gui/$(id -u)"
if ! launchctl bootstrap "$domain" "$PLIST"; then
  launchctl bootout "$domain" "$PLIST" >/dev/null 2>&1 || true
  launchctl bootstrap "$domain" "$PLIST"
fi
launchctl enable "${domain}/${LABEL}" >/dev/null 2>&1 || true
launchctl kickstart -k "${domain}/${LABEL}" >/dev/null 2>&1 || true

echo "Waiting for Tickslate..."
ready=0
for _ in $(seq 1 40); do
  if curl -fsS -o /dev/null --max-time 2 "http://${HOST}:${PORT}/" 2>/dev/null; then
    ready=1
    break
  fi
  sleep 0.5
done

if [[ "$ready" -ne 1 ]]; then
  echo "Tickslate did not come up. Recent log:" >&2
  tail -n 40 "${LOG_DIR}/tickslate.err.log" >&2 || true
  stop_service
  exit 1
fi

open "http://${HOST}:${PORT}/"
echo
echo "Tickslate is installed and running at http://${HOST}:${PORT}/"
echo "It starts again when you log in. Open that address in a browser."
echo "Logs: ${LOG_DIR}"
echo "Remove it with: ${ROOT}/uninstall.sh"
