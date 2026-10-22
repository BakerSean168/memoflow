#!/usr/bin/env bash
set -Eeuo pipefail

source_dir="$(cd "$(dirname "$0")" && pwd)"
runtime_dir=/usr/local/lib/memoflow-oracle2-watch
entry=/usr/local/bin/memoflow-oracle2-watch
service=memoflow-oracle2-deploy-watch.service
timer=memoflow-oracle2-deploy-watch.timer
state_dir=/var/lib/memoflow-oracle2-delivery

[[ $(id -u) -eq 0 ]] || { echo 'installer requires root' >&2; exit 2; }
[[ $# -le 1 ]] || { echo 'usage: install.sh [--enable|--disable]' >&2; exit 2; }
for command in node docker flock systemctl install; do
  command -v "$command" >/dev/null || { echo "missing $command" >&2; exit 2; }
done
node --check "$source_dir/watch-contract.mjs"
node --check "$source_dir/watch.mjs"
[[ -r /opt/memoflow-oracle2/compose.yaml && -r /opt/memoflow-oracle2/production.env ]] || {
  echo 'Oracle2 production Compose/env not found' >&2
  exit 2
}
docker compose version >/dev/null
[[ -r "$source_dir/systemd/$service" && -r "$source_dir/systemd/$timer" ]] || {
  echo 'Oracle2 systemd units missing' >&2
  exit 2
}
mkdir -p "$runtime_dir" "$state_dir"
chmod 0700 "$state_dir"
install -m 0644 "$source_dir/watch-contract.mjs" "$runtime_dir/watch-contract.mjs"
install -m 0755 "$source_dir/watch.mjs" "$runtime_dir/watch.mjs"
node_bin="$(command -v node)"
[[ "$node_bin" == /* && -x "$node_bin" ]] || { echo 'Node binary must be an executable absolute path' >&2; exit 2; }
sed "s@__NODE_BIN__@$node_bin@g" "$source_dir/watch-wrapper.sh" > "$entry"
chmod 0755 "$entry"
install -m 0644 "$source_dir/systemd/$service" "/etc/systemd/system/$service"
install -m 0644 "$source_dir/systemd/$timer" "/etc/systemd/system/$timer"
systemctl daemon-reload

mode=install
if [[ $# -eq 1 ]]; then mode="$1"; fi
case "$mode" in
  install)
    echo 'ORACLE2_WATCH_INSTALL=PASS timer_not_enabled_automatically=true'
    echo "next: $entry --check-only"
    echo "first adoption: $entry --adopt-current"
    echo "no-op verify: $entry --run-once"
    echo "enable after acceptance: $source_dir/install.sh --enable"
    ;;
  --enable)
    "$entry" --check-only
    "$entry" --run-once
    [[ $(node -p "JSON.parse(require('fs').readFileSync('$state_dir/oracle2-watch-state.json')).status") == DEPLOYED ]] || {
      echo 'watcher is not DEPLOYED; refusing timer enable' >&2
      exit 1
    }
    systemctl enable --now "$timer"
    echo 'ORACLE2_WATCH_TIMER=ENABLED'
    ;;
  --disable)
    systemctl disable --now "$timer"
    echo 'ORACLE2_WATCH_TIMER=DISABLED (production containers unchanged)'
    ;;
  *)
    echo 'usage: install.sh [--enable|--disable]' >&2
    exit 2
    ;;
esac
