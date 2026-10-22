#!/usr/bin/env bash
set -Eeuo pipefail
[[ $# -eq 1 ]] || { echo 'expected one watcher mode' >&2; exit 2; }
case "$1" in
  --check-only|--adopt-current|--run-once) ;;
  *) echo 'unsupported Oracle2 watcher mode' >&2; exit 2 ;;
esac
exec /usr/bin/flock -n /var/lib/memoflow-oracle2-delivery/oracle2-watch.lock \
  __NODE_BIN__ /usr/local/lib/memoflow-oracle2-watch/watch.mjs "$1"
