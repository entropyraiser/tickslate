#!/usr/bin/env bash
# Build Tickslate and start it from this project.
# It stays available at http://127.0.0.1:3000 until you stop it.
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

echo "Stopping a previous Tickslate server, if one is running..."
stop_service
remove_legacy_install

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

: > "$LOG_FILE"
# Start a new session so the server keeps running after this script exits.
PORT="$PORT" HOSTNAME="$HOST" NODE_ENV=production \
  python3 - "$NODE" "$server_dir" "$LOG_FILE" "$PID_FILE" <<'PY'
import os
import sys

node, server_dir, log_path, pid_path = sys.argv[1:5]
if os.fork() > 0:
    raise SystemExit(0)
os.setsid()
if os.fork() > 0:
    raise SystemExit(0)
os.chdir(server_dir)
log_fd = os.open(log_path, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o644)
os.dup2(log_fd, 1)
os.dup2(log_fd, 2)
os.close(log_fd)
devnull = os.open(os.devnull, os.O_RDONLY)
os.dup2(devnull, 0)
os.close(devnull)
with open(pid_path, "w", encoding="utf-8") as handle:
    handle.write(str(os.getpid()))
os.execv(node, [node, "server.js"])
PY

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
  tail -n 40 "$LOG_FILE" >&2 || true
  stop_local_process
  exit 1
fi

echo
echo "Tickslate is running at http://${HOST}:${PORT}/"
echo "Open that address in a browser when you want it."
echo "Stop it with: ${ROOT}/uninstall.sh"
