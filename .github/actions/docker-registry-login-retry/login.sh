#!/usr/bin/env bash
set -euo pipefail

DOCKER_BIN="${DOCKER_BIN:-docker}"

[[ "$MAX_ATTEMPTS" =~ ^[1-9][0-9]*$ ]] || { echo 'max_attempts must be a positive integer' >&2; exit 2; }
[[ "$INITIAL_DELAY_SECONDS" =~ ^[0-9]+$ ]] || { echo 'initial_delay_seconds must be a non-negative integer' >&2; exit 2; }

attempt=1
delay_seconds="$INITIAL_DELAY_SECONDS"

while true; do
  error_file="$(mktemp)"
  set +e
  printf '%s' "$PASSWORD" | "$DOCKER_BIN" login "$REGISTRY" --username "$USERNAME" --password-stdin 2>"$error_file"
  status=$?
  set -e

  if (( status == 0 )); then
    rm -f "$error_file"
    exit 0
  fi

  error_text="$(cat "$error_file")"
  rm -f "$error_file"
  printf '%s\n' "$error_text" >&2

  if grep -Eiq 'unauthorized|authentication required|denied|incorrect username or password|invalid username/password' <<<"$error_text"; then
    echo '::error::Registry login failed with a non-retryable authentication error.' >&2
    exit "$status"
  fi

  if ! grep -Eiq 'connection reset by peer|connection refused|network is unreachable|no route to host|i/o timeout|TLS handshake timeout|Client\.Timeout exceeded|context deadline exceeded|temporary failure|unexpected EOF|(^|[^A-Za-z])EOF([^A-Za-z]|$)|status code: (429|5[0-9]{2})' <<<"$error_text"; then
    echo '::error::Registry login failed with a non-retryable error.' >&2
    exit "$status"
  fi

  if (( attempt >= MAX_ATTEMPTS )); then
    echo "::error::Registry login exhausted $MAX_ATTEMPTS attempts after transient failures." >&2
    exit "$status"
  fi

  echo "::warning::Transient registry login failure on attempt $attempt/$MAX_ATTEMPTS; retrying in ${delay_seconds}s."
  sleep "$delay_seconds"
  attempt=$((attempt + 1))
  delay_seconds=$((delay_seconds * 3))
done
