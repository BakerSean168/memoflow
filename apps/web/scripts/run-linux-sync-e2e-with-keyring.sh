#!/usr/bin/env bash
# Runs one Nx target inside a real Linux Secret Service session.
#
# The collector launches a real Electron process, and its helper fails closed
# when safeStorage reports basic_text, so the lane needs an actual keyring
# rather than plain Xvfb. The session mirrors
# apps/desktop/scripts/run-linux-electron-e2e-with-keyring.sh: one D-Bus
# session, gnome-keyring started through the login lifecycle, and a sentinel
# store/lookup roundtrip before the target starts.
#
# Unlike the desktop wrapper this keeps HOME untouched and isolates the keyring
# through XDG_DATA_HOME. Playwright resolves its browser cache from HOME, and
# the sync config's webServer shells out to `corepack pnpm`, which treats a
# different HOME as a package-store migration.
set -euo pipefail

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "run-linux-sync-e2e-with-keyring.sh only supports Linux" >&2
  exit 2
fi
for command in dbus-run-session gnome-keyring-daemon gdbus secret-tool timeout xvfb-run pnpm node; do
  command -v "$command" >/dev/null 2>&1 || { echo "Missing required Linux sync E2E dependency: $command" >&2; exit 2; }
done

target="${1:-}"
if [[ -z "$target" ]]; then
  echo "usage: run-linux-sync-e2e-with-keyring.sh <nx target>" >&2
  exit 2
fi

workspace_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
test -f "$workspace_root/nx.json" || { echo "Invalid workspace root: $workspace_root" >&2; exit 2; }

cd "$workspace_root"

keyring_root="$(mktemp -d)"
cleanup() { rm -rf "$keyring_root"; }
trap cleanup EXIT

export MEMOFLOW_SYNC_E2E_KEYRING_DATA="$keyring_root/data"
export MEMOFLOW_SYNC_E2E_KEYRING_RUNTIME="$keyring_root/runtime"
export MEMOFLOW_SYNC_E2E_WORKSPACE_ROOT="$workspace_root"
export MEMOFLOW_SYNC_E2E_TARGET="$target"

# The collector strips Playwright's Electron test-only --password-store=basic
# switch only when this flag is set; without it the helper sees basic_text and
# fails closed.
export MEMOFLOW_E2E_USE_GNOME_KEYRING=1

# The suite builds desktop and drives three specs across API, Web and Electron,
# so the whole headless session keeps a larger budget than a single spec.
sync_timeout_seconds="${MEMOFLOW_SYNC_E2E_TIMEOUT_SECONDS:-1500}"

# shellcheck disable=SC2016 # Inner bash must expand its own HOME/XDG/RANDOM/$$.
timeout --signal=TERM --kill-after=15s "${sync_timeout_seconds}s" \
  xvfb-run -a dbus-run-session -- bash -lc '
  set -euo pipefail
  export XDG_DATA_HOME="$MEMOFLOW_SYNC_E2E_KEYRING_DATA"
  export XDG_RUNTIME_DIR="$MEMOFLOW_SYNC_E2E_KEYRING_RUNTIME"
  export XDG_CURRENT_DESKTOP=GNOME
  export DESKTOP_SESSION=gnome
  control_dir="$XDG_RUNTIME_DIR/keyring"
  unset GNOME_KEYRING_CONTROL SSH_AUTH_SOCK || true
  mkdir -p "$XDG_DATA_HOME/keyrings" "$XDG_RUNTIME_DIR" "$control_dir"
  chmod 700 "$XDG_DATA_HOME" "$XDG_RUNTIME_DIR" "$control_dir"

  import_keyring_env() {
    local line
    while IFS= read -r line; do
      case "$line" in
        GNOME_KEYRING_CONTROL=*|SSH_AUTH_SOCK=*) export "$line" ;;
      esac
    done
  }

  # Mirror the lifecycle GNOME Keyring expects from a desktop login: the PAM
  # phase owns creation/unlock of the ephemeral login collection, --start then
  # binds that daemon to this D-Bus session. Direct --unlock leaves D-Bus
  # activation free to start a second locked daemon that blocks on a prompt.
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

  sentinel_key="memoflow-sync-e2e-sentinel-$RANDOM-$$"
  sentinel_value="memoflow-sync-e2e-secret-$RANDOM-$$"
  printf "%s" "$sentinel_value" | timeout --signal=TERM --kill-after=2s 10s \
    secret-tool store --label="MemoFlow sync E2E" memoflow-sync-e2e "$sentinel_key"
  resolved_value="$(timeout --signal=TERM --kill-after=2s 10s \
    secret-tool lookup memoflow-sync-e2e "$sentinel_key")"
  test "$resolved_value" = "$sentinel_value"
  timeout --signal=TERM --kill-after=2s 10s secret-tool clear memoflow-sync-e2e "$sentinel_key"
  unset sentinel_key sentinel_value resolved_value

  cd "$MEMOFLOW_SYNC_E2E_WORKSPACE_ROOT"
  exec pnpm exec nx run "$MEMOFLOW_SYNC_E2E_TARGET" --outputStyle=static
'
