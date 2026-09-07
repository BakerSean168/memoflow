#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "run-linux-electron-e2e-with-keyring.sh only supports Linux" >&2
  exit 2
fi
for command in dbus-run-session gnome-keyring-daemon gdbus secret-tool timeout xvfb-run pnpm node; do
  command -v "$command" >/dev/null 2>&1 || { echo "Missing required Linux Electron E2E dependency: $command" >&2; exit 2; }
done

workspace_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
test -f "$workspace_root/nx.json" || { echo "Invalid workspace root: $workspace_root" >&2; exit 2; }

cd "$workspace_root"
pnpm nx run desktop:build --outputStyle=static
pnpm nx run desktop:native-rebuild --outputStyle=static

ephemeral_home="$(mktemp -d)"
cleanup() { rm -rf "$ephemeral_home"; }
trap cleanup EXIT

export MEMOFLOW_E2E_KEYRING_HOME="$ephemeral_home"
export MEMOFLOW_E2E_WORKSPACE_ROOT="$workspace_root"
export MEMOFLOW_E2E_USE_GNOME_KEYRING=1

timeout --signal=TERM --kill-after=15s 210s \
  xvfb-run -a dbus-run-session -- bash -lc '
  set -euo pipefail
  export HOME="$MEMOFLOW_E2E_KEYRING_HOME"
  export XDG_RUNTIME_DIR="$HOME/.runtime"
  export XDG_CURRENT_DESKTOP=GNOME
  export DESKTOP_SESSION=gnome
  control_dir="$XDG_RUNTIME_DIR/keyring"
  unset GNOME_KEYRING_CONTROL SSH_AUTH_SOCK || true
  mkdir -p "$HOME/.local/share/keyrings" "$XDG_RUNTIME_DIR" "$control_dir"
  chmod 700 "$HOME" "$XDG_RUNTIME_DIR" "$control_dir"

  import_keyring_env() {
    local line
    while IFS= read -r line; do
      case "$line" in
        GNOME_KEYRING_CONTROL=*|SSH_AUTH_SOCK=*) export "$line" ;;
      esac
    done
  }

  login_env="$(printf "\n" | timeout --signal=TERM --kill-after=2s 10s \
    gnome-keyring-daemon --login --components=secrets --control-directory="$control_dir")"
  import_keyring_env <<< "$login_env"
  : "${GNOME_KEYRING_CONTROL:?gnome-keyring --login did not emit a control directory}"
  test "$GNOME_KEYRING_CONTROL" = "$control_dir"

  start_env="$(timeout --signal=TERM --kill-after=2s 10s \
    gnome-keyring-daemon --start --components=secrets --control-directory="$control_dir")"
  import_keyring_env <<< "$start_env"
  unset login_env start_env

  secret_service_ready=0
  for _ in $(seq 1 50); do
    if timeout 2s gdbus call --session \
      --dest org.freedesktop.DBus \
      --object-path /org/freedesktop/DBus \
      --method org.freedesktop.DBus.GetNameOwner \
      org.freedesktop.secrets >/dev/null 2>&1; then
      secret_service_ready=1
      break
    fi
    sleep 0.1
  done
  test "$secret_service_ready" = 1

  sentinel_key="memoflow-e2e-sentinel-$RANDOM-$$"
  sentinel_value="memoflow-e2e-secret-$RANDOM-$$"
  printf "%s" "$sentinel_value" | timeout --signal=TERM --kill-after=2s 10s \
    secret-tool store --label="MemoFlow Electron E2E" memoflow-e2e "$sentinel_key"
  resolved_value="$(timeout --signal=TERM --kill-after=2s 10s \
    secret-tool lookup memoflow-e2e "$sentinel_key")"
  test "$resolved_value" = "$sentinel_value"
  timeout --signal=TERM --kill-after=2s 10s secret-tool clear memoflow-e2e "$sentinel_key"
  unset sentinel_key sentinel_value resolved_value

  cd "$MEMOFLOW_E2E_WORKSPACE_ROOT/apps/desktop"
  exec node ../../node_modules/@playwright/test/cli.js test --config playwright.config.ts "$@"
' bash "$@"
