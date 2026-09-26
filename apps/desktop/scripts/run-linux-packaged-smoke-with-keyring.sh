#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "run-linux-packaged-smoke-with-keyring.sh only supports Linux" >&2
  exit 2
fi
: "${MEMOFLOW_PACKAGED_EXECUTABLE:?MEMOFLOW_PACKAGED_EXECUTABLE must point to the packaged MemoFlow executable}"
for command in dbus-run-session gnome-keyring-daemon gdbus secret-tool timeout xvfb-run node; do
  command -v "$command" >/dev/null 2>&1 || { echo "Missing required Linux packaged-smoke dependency: $command" >&2; exit 2; }
done

workspace_root="${MEMOFLOW_PACKAGED_SMOKE_WORKSPACE_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
workspace_root="$(cd "$workspace_root" && pwd)"
test -f "$workspace_root/nx.json" || { echo "Invalid packaged-smoke workspace root: $workspace_root" >&2; exit 2; }
ephemeral_home="$(mktemp -d)"
cleanup() { rm -rf "$ephemeral_home"; }
trap cleanup EXIT

export MEMOFLOW_PACKAGED_EXECUTABLE
export MEMOFLOW_CI_KEYRING_HOME="$ephemeral_home"
export MEMOFLOW_WORKSPACE_ROOT="$workspace_root"

# Bound the entire headless Secret Service session, not only Playwright. A
# keyring startup regression, Xvfb/D-Bus teardown stall, or application smoke
# hang must fail closed without stranding a release runner.
# shellcheck disable=SC2016 # Inner bash must expand HOME/RANDOM/$$, not this outer shell.
timeout --signal=TERM --kill-after=15s 210s \
  xvfb-run -a dbus-run-session -- bash -lc '
  set -euo pipefail
  export HOME="$MEMOFLOW_CI_KEYRING_HOME"
  export XDG_RUNTIME_DIR="$HOME/.runtime"
  export XDG_CURRENT_DESKTOP=GNOME
  export DESKTOP_SESSION=gnome
  export MEMOFLOW_PACKAGED_USE_GNOME_KEYRING=1
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

  # Mirror the lifecycle GNOME Keyring expects from a desktop login. The PAM
  # phase owns creation/unlock of the ephemeral login collection; --start then
  # binds that same daemon/control directory to this D-Bus session. Direct
  # --unlock and hand-written keyring files can leave D-Bus activation to
  # start a second locked daemon that blocks on SystemPrompter.
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

  # Fail closed unless the exact Secret Service instance is writable/readable
  # before Electron launches. Bound every operation so a prompt regression is
  # reported here rather than consuming the whole workflow step timeout.
  sentinel_key="memoflow-ci-sentinel-$RANDOM-$$"
  sentinel_value="memoflow-ci-secret-$RANDOM-$$"
  printf "%s" "$sentinel_value" | timeout --signal=TERM --kill-after=2s 10s \
    secret-tool store --label="MemoFlow CI packaged smoke" memoflow-ci "$sentinel_key"
  resolved_value="$(timeout --signal=TERM --kill-after=2s 10s \
    secret-tool lookup memoflow-ci "$sentinel_key")"
  test "$resolved_value" = "$sentinel_value"
  timeout --signal=TERM --kill-after=2s 10s secret-tool clear memoflow-ci "$sentinel_key"
  unset sentinel_key sentinel_value resolved_value

  cd "$MEMOFLOW_WORKSPACE_ROOT"
  # Invoke the workspace Nx CLI directly. Changing HOME is required for keyring
  # isolation, but asking pnpm to spawn Nx makes pnpm treat that HOME change as
  # a package-store migration and attempt to reinstall node_modules.
  timeout --signal=TERM --kill-after=15s 150s \
    node "$MEMOFLOW_WORKSPACE_ROOT/node_modules/nx/dist/bin/nx.js" \
    run desktop:test:packaged-smoke --outputStyle=static
'
