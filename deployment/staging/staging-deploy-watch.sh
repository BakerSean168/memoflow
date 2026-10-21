#!/usr/bin/env bash
set -Eeuo pipefail

CONFIG_FILE=${MEMOFLOW_STAGING_CHANNEL_CONFIG:-$HOME/.config/memoflow/staging-channel.env}
STATE_DIR=${MEMOFLOW_STAGING_STATE_DIR:-$HOME/.local/state/memoflow}
RUNTIME_ROOT=${MEMOFLOW_STAGING_RUNTIME_ROOT:-$HOME/.local/share/memoflow/staging-runtime}
BIN_DIR=${MEMOFLOW_STAGING_BIN_DIR:-$HOME/.local/bin}
SYSTEMD_DIR=${MEMOFLOW_STAGING_SYSTEMD_DIR:-$HOME/.config/systemd/user}
STATE_FILE="$STATE_DIR/staging-deploy-state"
LOCK_FILE="$STATE_DIR/staging-deploy.lock"
CHECK_ONLY=false
FORCE=false

for arg in "$@"; do
  case "$arg" in
    --check-only) CHECK_ONLY=true ;;
    --force) FORCE=true ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

log() { printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
fail() { log "ERROR: $*" >&2; exit 1; }

[[ -s "$CONFIG_FILE" ]] || fail "missing staging channel config: $CONFIG_FILE"
# Non-secret coordinates only.
set -a
# shellcheck disable=SC1090
source "$CONFIG_FILE"
set +a

REGISTRY=${STAGING_REGISTRY:?set STAGING_REGISTRY in $CONFIG_FILE}
NAMESPACE=${STAGING_NAMESPACE:?set STAGING_NAMESPACE in $CONFIG_FILE}
DISTRIBUTION=${STAGING_DISTRIBUTION:-global}
CHANNEL_TAG=${STAGING_CHANNEL_TAG:-staging-latest}
SECRET_ENV=${STAGING_SECRET_ENV:-$HOME/.config/memoflow/staging.env}
COMPOSE_PROJECT=${STAGING_COMPOSE_PROJECT:-memoflow-staging}
[[ "$CHANNEL_TAG" == staging-latest ]] || fail 'canonical watcher only accepts STAGING_CHANNEL_TAG=staging-latest'
[[ "$DISTRIBUTION" == global || "$DISTRIBUTION" == china ]] || fail 'STAGING_DISTRIBUTION must be global or china'
[[ -s "$SECRET_ENV" ]] || fail "missing staging secret env: $SECRET_ENV"
mkdir -p "$STATE_DIR" "$RUNTIME_ROOT" "$BIN_DIR" "$SYSTEMD_DIR"
exec 9>"$LOCK_FILE"
flock -n 9 || { log 'another staging deploy check is already running'; exit 0; }

web_channel="$REGISTRY/$NAMESPACE/memoflow-web:$CHANNEL_TAG"
api_channel="$REGISTRY/$NAMESPACE/memoflow-api:$CHANNEL_TAG"
migrator_channel="$REGISTRY/$NAMESPACE/memoflow-migrator:$CHANNEL_TAG"
runtime_channel="$REGISTRY/$NAMESPACE/memoflow-staging-runtime:$CHANNEL_TAG"

image_revision() {
  docker image inspect "$1" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' 2>/dev/null || true
}

image_digest() {
  local ref="$1" repo entry
  repo="${ref%:*}"
  while IFS= read -r entry; do
    [[ "$entry" == "$repo@"sha256:* ]] || continue
    printf '%s\n' "${entry#*@}"
    return 0
  done < <(docker image inspect "$ref" --format '{{range .RepoDigests}}{{println .}}{{end}}' 2>/dev/null || true)
}

pull_channel() {
  docker pull "$1" >/dev/null
}

runtime_container=''
stage=''
cleanup() {
  [[ -z "$runtime_container" ]] || docker rm -f "$runtime_container" >/dev/null 2>&1 || true
  [[ -z "$stage" ]] || rm -rf "$stage"
}
trap cleanup EXIT

log "checking $DISTRIBUTION staging-latest channel"
for ref in "$runtime_channel" "$web_channel" "$api_channel" "$migrator_channel"; do pull_channel "$ref"; done
runtime_revision=$(image_revision "$runtime_channel")
web_revision=$(image_revision "$web_channel")
api_revision=$(image_revision "$api_channel")
migrator_revision=$(image_revision "$migrator_channel")
for pair in "runtime:$runtime_revision" "web:$web_revision" "api:$api_revision" "migrator:$migrator_revision"; do
  [[ -n "${pair#*:}" ]] || fail "${pair%%:*} staging image has no org.opencontainers.image.revision"
done
if ! [[ "$runtime_revision" == "$web_revision" && "$runtime_revision" == "$api_revision" && "$runtime_revision" == "$migrator_revision" ]]; then
  log "staging channel not coherent yet: runtime=$runtime_revision web=$web_revision api=$api_revision migrator=$migrator_revision"
  exit 0
fi
desired_revision="$runtime_revision"

stage=$(mktemp -d "$STATE_DIR/staging-runtime-next.XXXXXX")
runtime_container=$(docker create "$runtime_channel" /bin/true)
docker cp "$runtime_container:/runtime/staging/." "$stage/"
docker rm "$runtime_container" >/dev/null
runtime_container=''
for required in candidate-set-v1.json docker-compose.staging.yml staging-deploy-watch.sh docker/powersync/powersync.yaml docker/powersync/sync-config.yaml tools/ci-cd-platform/runtime-image-mirrors.json tools/ci-cd-platform/candidate-manifest.mjs tools/ci-cd-platform/lib/contracts.mjs; do
  [[ -s "$stage/$required" ]] || fail "candidate runtime missing artifact: $required"
done
node "$stage/tools/ci-cd-platform/candidate-manifest.mjs" --validate "$stage/candidate-set-v1.json" >/dev/null
candidate_revision=$(node -p "require('$stage/candidate-set-v1.json').gitSha")
candidate_digest=$(node -p "require('$stage/candidate-set-v1.json').digest")
[[ "$candidate_revision" == "$desired_revision" ]] || fail "runtime candidate revision mismatch: $candidate_revision != $desired_revision"

channel_digest_for() {
  case "$1" in
    web) image_digest "$web_channel" ;;
    api) image_digest "$api_channel" ;;
    migrator) image_digest "$migrator_channel" ;;
    *) return 2 ;;
  esac
}
repo_for() { node -p "require('$stage/candidate-set-v1.json').images.$1.distributions.$DISTRIBUTION.repository"; }
expected_digest_for() { node -p "require('$stage/candidate-set-v1.json').images.$1.digest"; }
mirror_field_for() {
  local name="$1" field="$2"
  node -e "const c=require('$stage/tools/ci-cd-platform/runtime-image-mirrors.json');const x=c.images.find((i)=>i.name===process.argv[1]);if(!x)process.exit(2);const v=x[process.argv[2]];if(typeof v!=='string'||!v)process.exit(3);process.stdout.write(v)" "$name" "$field"
}
runtime_mirror_ref() {
  local name="$1" source tag expected_digest digest_hex tag_ref actual_digest curated_digest
  source=$(mirror_field_for "$name" source) || fail "missing runtime mirror source for $name"
  tag=$(mirror_field_for "$name" tag) || fail "missing runtime mirror tag for $name"
  [[ "${source##*@}" =~ ^sha256:[0-9a-f]{64}$ ]] || fail "$name runtime mirror source is not digest-pinned"
  curated_digest=$(mirror_field_for "$name" mirrorDigest || true)
  expected_digest="${curated_digest:-${source##*@}}"
  [[ "$expected_digest" =~ ^sha256:[0-9a-f]{64}$ ]] || fail "$name runtime mirror digest is not pinned"
  digest_hex="${expected_digest#sha256:}"
  [[ "$tag" == *"${digest_hex:0:12}" ]] || fail "$name runtime mirror tag does not bind digest prefix"
  tag_ref="$REGISTRY/$NAMESPACE/$name:$tag"
  pull_channel "$tag_ref"
  actual_digest=$(image_digest "$tag_ref")
  [[ "$actual_digest" == "$expected_digest" ]] || fail "$name runtime mirror digest mismatch: $actual_digest != $expected_digest"
  printf '%s\n' "$REGISTRY/$NAMESPACE/$name@$expected_digest"
}
for component in web api migrator; do
  selected_repo=$(repo_for "$component")
  expected_repo="$REGISTRY/$NAMESPACE/memoflow-$component"
  [[ "$selected_repo" == "$expected_repo" ]] || fail "$component $DISTRIBUTION repository mismatch: $selected_repo != $expected_repo"
  expected=$(expected_digest_for "$component")
  actual=$(channel_digest_for "$component")
  [[ "$actual" == "$expected" ]] || fail "$component staging digest mismatch: $actual != $expected"
done
runtime_digest=$(image_digest "$runtime_channel")
[[ "$runtime_digest" =~ ^sha256:[0-9a-f]{64}$ ]] || fail 'runtime staging digest is missing'
postgres_runtime_image=$(runtime_mirror_ref memoflow-postgres)
redis_runtime_image=$(runtime_mirror_ref memoflow-redis)
powersync_runtime_image=$(runtime_mirror_ref memoflow-powersync)

managed_revision=$(sed -n 's/^revision=//p' "$STATE_FILE" 2>/dev/null | tail -1 || true)
managed_status=$(sed -n 's/^status=//p' "$STATE_FILE" 2>/dev/null | tail -1 || true)
if $CHECK_ONLY; then
  log "STAGING_CANDIDATE=COHERENT revision=$desired_revision candidate=$candidate_digest managed=${managed_revision:-none} status=${managed_status:-none}"
  exit 0
fi
if [[ "$managed_status" == BLOCKED ]] && ! $FORCE; then
  fail "staging deployment is BLOCKED; inspect state/evidence and use --force only after an operator recovery decision"
fi

mkdir -p "$stage/systemd"
cat > "$stage/runtime-images.env" <<ENV
STAGING_WEB_IMAGE=$(repo_for web)@$(expected_digest_for web)
STAGING_API_IMAGE=$(repo_for api)@$(expected_digest_for api)
STAGING_MIGRATOR_IMAGE=$(repo_for migrator)@$(expected_digest_for migrator)
STAGING_POSTGRES_IMAGE=$postgres_runtime_image
STAGING_REDIS_IMAGE=$redis_runtime_image
STAGING_POWERSYNC_IMAGE=$powersync_runtime_image
STAGING_SECRET_ENV=$SECRET_ENV
ENV

compose_root() {
  local root="$1"; shift
  docker compose -p "$COMPOSE_PROJECT" -f "$root/docker-compose.staging.yml" --env-file "$SECRET_ENV" --env-file "$root/runtime-images.env" "$@"
}
compose() { compose_root "$RUNTIME_ROOT" "$@"; }

wait_healthy() {
  local service="$1" timeout="${2:-120}" start id status
  start=$(date +%s)
  while :; do
    id=$(compose ps -q "$service" 2>/dev/null || true)
    if [[ -n "$id" ]]; then
      status=$(docker inspect "$id" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' 2>/dev/null || true)
      [[ "$status" == healthy ]] && return 0
    fi
    if (( $(date +%s) - start >= timeout )); then
      if [[ -n "${id:-}" ]]; then docker logs --tail 100 "$id" 2>&1 || true; fi
      return 1
    fi
    sleep 2
  done
}

container_revision() {
  local service="$1" id image_id
  id=$(compose ps -q "$service" 2>/dev/null || true)
  [[ -n "$id" ]] || return 0
  image_id=$(docker inspect "$id" --format '{{.Image}}' 2>/dev/null || true)
  [[ -n "$image_id" ]] || return 0
  docker image inspect "$image_id" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' 2>/dev/null || true
}

service_is_healthy() {
  local service="$1" id status
  id=$(compose ps -q "$service" 2>/dev/null || true)
  [[ -n "$id" ]] || return 1
  status=$(docker inspect "$id" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' 2>/dev/null || true)
  [[ "$status" == healthy ]]
}

state_matches() {
  [[ "$managed_revision" == "$desired_revision" ]] || return 1
  [[ "$(sed -n 's/^candidate_digest=//p' "$STATE_FILE" | tail -1)" == "$candidate_digest" ]] || return 1
  [[ "$(container_revision api)" == "$desired_revision" ]] || return 1
  [[ "$(container_revision web)" == "$desired_revision" ]] || return 1
  service_is_healthy api || return 1
  service_is_healthy powersync || return 1
  service_is_healthy web || return 1
}
if ! $FORCE && state_matches; then
  log "already deployed staging revision $desired_revision"
  exit 0
fi

rm -rf "$RUNTIME_ROOT.next"
mkdir -p "$RUNTIME_ROOT.next"
cp -a "$stage/." "$RUNTIME_ROOT.next/"
rm -rf "$RUNTIME_ROOT.prev"
if [[ -d "$RUNTIME_ROOT" ]]; then mv "$RUNTIME_ROOT" "$RUNTIME_ROOT.prev"; fi
mv "$RUNTIME_ROOT.next" "$RUNTIME_ROOT"

migrated=false
write_blocked_state() {
  local reason="${1:-error}" tmp
  tmp="$STATE_FILE.tmp.$$"
  cat > "$tmp" <<STATE
status=BLOCKED
revision=$desired_revision
candidate_digest=$candidate_digest
runtime_digest=$runtime_digest
blocked_reason=$reason
blocked_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
STATE
  chmod 0644 "$tmp"
  mv -f "$tmp" "$STATE_FILE"
}
rollback_pre_migration() {
  if $migrated; then
    return 1
  fi
  [[ -d "$RUNTIME_ROOT.prev" && -s "$RUNTIME_ROOT.prev/runtime-images.env" ]] || return 1
  log 'restoring previous staging runtime before migration boundary'
  rm -rf "$RUNTIME_ROOT.failed"
  mv "$RUNTIME_ROOT" "$RUNTIME_ROOT.failed"
  mv "$RUNTIME_ROOT.prev" "$RUNTIME_ROOT"
  compose up -d --no-build postgres redis api powersync web >/dev/null 2>&1 || true
  return 0
}

on_failure() {
  local status=$?
  trap - ERR TERM INT HUP
  if ! rollback_pre_migration; then
    write_blocked_state error
    log 'deployment crossed migration boundary; recorded BLOCKED instead of blind rollback'
  fi
  exit "$status"
}
on_signal() {
  local signal="$1" status="$2"
  trap - ERR TERM INT HUP
  if ! rollback_pre_migration; then
    write_blocked_state "signal_$signal"
    log "deployment interrupted by $signal after migration boundary; recorded BLOCKED"
  fi
  exit "$status"
}
trap on_failure ERR
trap 'on_signal TERM 143' TERM
trap 'on_signal INT 130' INT
trap 'on_signal HUP 129' HUP

log "deploying coherent staging revision $desired_revision"
compose up -d --no-build postgres redis
wait_healthy postgres 120
wait_healthy redis 90
compose stop web powersync api >/dev/null 2>&1 || true
compose rm -f migrator >/dev/null 2>&1 || true
compose run --rm --no-deps migrator
migrated=true
compose up -d --no-build --no-deps api
wait_healthy api 180
[[ "$(container_revision api)" == "$desired_revision" ]] || fail 'staging API revision check failed'
compose up -d --no-build --no-deps powersync
wait_healthy powersync 150
compose up -d --no-build --no-deps web
wait_healthy web 120
[[ "$(container_revision web)" == "$desired_revision" ]] || fail 'staging Web revision check failed'

curl -fsS --max-time 15 "http://127.0.0.1:${API_HOST_PORT:-20251}/healthz" >/dev/null
curl -fsS --max-time 15 "http://127.0.0.1:${WEB_HOST_PORT:-20250}/" >/dev/null
curl -fsS --max-time 15 "http://127.0.0.1:${POWERSYNC_HOST_PORT:-20252}/probes/liveness" >/dev/null
for url in "${STAGING_EXTERNAL_API_URL:-}" "${STAGING_EXTERNAL_WEB_URL:-}" "${STAGING_EXTERNAL_POWERSYNC_URL:-}"; do
  [[ -z "$url" ]] || curl -fsS --max-time 20 "$url" >/dev/null
done

install -m 0755 "$RUNTIME_ROOT/staging-deploy-watch.sh" "$BIN_DIR/memoflow-staging-deploy-watch"
install -m 0644 "$RUNTIME_ROOT/systemd/memoflow-staging-deploy-watch.service" "$SYSTEMD_DIR/memoflow-staging-deploy-watch.service"
install -m 0644 "$RUNTIME_ROOT/systemd/memoflow-staging-deploy-watch.timer" "$SYSTEMD_DIR/memoflow-staging-deploy-watch.timer"
if command -v systemctl >/dev/null 2>&1; then systemctl --user daemon-reload || true; fi

state_tmp="$STATE_FILE.tmp.$$"
cat > "$state_tmp" <<STATE
status=DEPLOYED
revision=$desired_revision
candidate_digest=$candidate_digest
runtime_digest=$runtime_digest
web_digest=$(expected_digest_for web)
api_digest=$(expected_digest_for api)
migrator_digest=$(expected_digest_for migrator)
postgres_digest=${postgres_runtime_image##*@}
redis_digest=${redis_runtime_image##*@}
powersync_digest=${powersync_runtime_image##*@}
deployed_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
STATE
chmod 0644 "$state_tmp"
mv -f "$state_tmp" "$STATE_FILE"
rm -rf "$RUNTIME_ROOT.prev" "$RUNTIME_ROOT.failed"
trap - ERR TERM INT HUP
log "STAGING_DEPLOY=PASS revision=$desired_revision candidate=$candidate_digest"
