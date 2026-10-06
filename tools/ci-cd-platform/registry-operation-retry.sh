#!/usr/bin/env bash
set -euo pipefail

if (( $# == 0 )); then
  echo 'usage: registry-operation-retry.sh <command> [args...]' >&2
  exit 2
fi

max_attempts="${REGISTRY_RETRY_MAX_ATTEMPTS:-3}"
delay_seconds="${REGISTRY_RETRY_INITIAL_DELAY_SECONDS:-5}"

[[ "$max_attempts" =~ ^[1-9][0-9]*$ ]] || { echo 'REGISTRY_RETRY_MAX_ATTEMPTS must be a positive integer' >&2; exit 2; }
[[ "$delay_seconds" =~ ^[0-9]+$ ]] || { echo 'REGISTRY_RETRY_INITIAL_DELAY_SECONDS must be a non-negative integer' >&2; exit 2; }

attempt=1
while true; do
  stdout_file="$(mktemp)"
  stderr_file="$(mktemp)"
  set +e
  "$@" >"$stdout_file" 2>"$stderr_file"
  status=$?
  set -e

  if (( status == 0 )); then
    cat "$stdout_file"
    cat "$stderr_file" >&2
    rm -f "$stdout_file" "$stderr_file"
    exit 0
  fi

  error_text="$(cat "$stderr_file")"
  printf '%s\n' "$error_text" >&2
  rm -f "$stdout_file" "$stderr_file"

  if grep -Eiq 'unauthorized|authentication required|denied|incorrect username or password|invalid username/password|insufficient_scope|forbidden' <<<"$error_text"; then
    echo '::error::Registry operation failed with a non-retryable authentication/authorization error.' >&2
    exit "$status"
  fi

  if ! grep -Eiq 'connection reset by peer|connection refused|network is unreachable|no route to host|i/o timeout|TLS handshake timeout|Client\.Timeout exceeded|context deadline exceeded|temporary failure|unexpected EOF|(^|[^A-Za-z])EOF([^A-Za-z]|$)|status code: (429|5[0-9]{2})|unexpected status from (HEAD|GET|POST|PUT|PATCH|DELETE) request: (429|5[0-9]{2})' <<<"$error_text"; then
    echo '::error::Registry operation failed with a non-retryable error.' >&2
    exit "$status"
  fi

  if (( attempt >= max_attempts )); then
    echo "::error::Registry operation exhausted $max_attempts attempts after transient failures." >&2
    exit "$status"
  fi

  echo "::warning::Transient registry operation failure on attempt $attempt/$max_attempts; retrying in ${delay_seconds}s." >&2
  sleep "$delay_seconds"
  attempt=$((attempt + 1))
  delay_seconds=$((delay_seconds * 3))
done
