#!/usr/bin/env bash
set -Eeuo pipefail

CONFIG_FILE=${MEMOFLOW_PRODUCTION_CHANNEL_CONFIG:-/etc/memoflow/production-channel.env}
STATE_DIR=${MEMOFLOW_PRODUCTION_STATE_DIR:-/var/lib/memoflow-delivery}
RUNTIME_ROOT=${MEMOFLOW_PRODUCTION_RUNTIME_ROOT:-/opt/memoflow/runtime}
LEGACY_ROOT=${MEMOFLOW_PRODUCTION_LEGACY_ROOT:-/opt/memoflow}
STATE_FILE="$STATE_DIR/production-deploy-state"
LOCK_FILE="$STATE_DIR/production-deploy.lock"
BACKUP_ROOT="$STATE_DIR/backups"
BIN_PATH=${MEMOFLOW_PRODUCTION_BIN_PATH:-/usr/local/bin/memoflow-production-deploy-watch}
SYSTEMD_DIR=${MEMOFLOW_PRODUCTION_SYSTEMD_DIR:-/etc/systemd/system}
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
fail() { log "ERROR: $*" >&2; return 1; }

[[ -s "$CONFIG_FILE" ]] || fail "missing production channel config: $CONFIG_FILE"
set -a
# shellcheck disable=SC1090
source "$CONFIG_FILE"
set +a
REGISTRY=${PRODUCTION_REGISTRY:?set PRODUCTION_REGISTRY in $CONFIG_FILE}
NAMESPACE=${PRODUCTION_NAMESPACE:?set PRODUCTION_NAMESPACE in $CONFIG_FILE}
CHANNEL_TAG=${PRODUCTION_CHANNEL_TAG:-production-selected}
SECRET_ENV=${PRODUCTION_SECRET_ENV:-/opt/memoflow/.env.production.local}
COMPOSE_PROJECT=${PRODUCTION_COMPOSE_PROJECT:-memoflow}
[[ "$CHANNEL_TAG" == production-selected ]] || fail 'canonical watcher only accepts PRODUCTION_CHANNEL_TAG=production-selected'
[[ -s "$SECRET_ENV" ]] || fail "missing production secret env: $SECRET_ENV"
mkdir -p "$STATE_DIR" "$BACKUP_ROOT"
chmod 0700 "$STATE_DIR" "$BACKUP_ROOT"
exec 9>"$LOCK_FILE"
flock -n 9 || { log 'another production deploy check is already running'; exit 0; }

runtime_channel="$REGISTRY/$NAMESPACE/memoflow-production-runtime:$CHANNEL_TAG"
runtime_container=''
stage=''
cleanup() {
  [[ -z "$runtime_container" ]] || docker rm -f "$runtime_container" >/dev/null 2>&1 || true
  [[ -z "$stage" ]] || rm -rf "$stage"
}
trap cleanup EXIT

image_label() {
  docker image inspect "$1" --format "{{index .Config.Labels \"$2\"}}" 2>/dev/null || true
}
image_digest() {
  local ref="$1" repo entry
  if [[ "$ref" == *@* ]]; then repo=${ref%@*}; else repo=${ref%:*}; fi
  while IFS= read -r entry; do
    [[ "$entry" == "$repo@"sha256:* ]] || continue
    printf '%s\n' "${entry#*@}"
    return 0
  done < <(docker image inspect "$ref" --format '{{range .RepoDigests}}{{println .}}{{end}}' 2>/dev/null || true)
}
pull_exact() {
  local ref="$1" expected="${1##*@}" actual
  [[ "$expected" =~ ^sha256:[0-9a-f]{64}$ ]] || fail "non-exact image ref: $ref"
  docker pull "$ref" >/dev/null
  actual=$(image_digest "$ref")
  [[ "$actual" == "$expected" ]] || fail "image digest mismatch for $ref: $actual != $expected"
}

log 'checking production-selected control artifact'
docker pull "$runtime_channel" >/dev/null
runtime_digest=$(image_digest "$runtime_channel")
[[ "$runtime_digest" =~ ^sha256:[0-9a-f]{64}$ ]] || fail 'production runtime digest is missing'
control_plane_sha=$(image_label "$runtime_channel" org.opencontainers.image.revision)
release_sha_label=$(image_label "$runtime_channel" io.memoflow.release.revision)
production_set_label=$(image_label "$runtime_channel" io.memoflow.production-set.digest)
production_set_sha_label=$(image_label "$runtime_channel" io.memoflow.production-set.sha256)
[[ "$control_plane_sha" =~ ^[0-9a-f]{40}$ ]] || fail 'runtime control-plane revision label is invalid'
[[ "$release_sha_label" =~ ^[0-9a-f]{40}$ ]] || fail 'runtime release revision label is invalid'
[[ "$production_set_label" =~ ^sha256:[0-9a-f]{64}$ ]] || fail 'runtime production-set digest label is invalid'
[[ "$production_set_sha_label" =~ ^sha256:[0-9a-f]{64}$ ]] || fail 'runtime production-set file hash label is invalid'

state_value() {
  local key="$1"
  sed -n "s/^${key}=//p" "$STATE_FILE" 2>/dev/null | tail -1 || true
}
live_container_id() {
  local service="$1"
  docker ps -q --filter "label=com.docker.compose.project=$COMPOSE_PROJECT" --filter "label=com.docker.compose.service=$service" | head -n1
}
live_container_ref() {
  local service="$1" id
  id=$(live_container_id "$service")
  [[ -n "$id" ]] || return 1
  docker inspect "$id" --format '{{.Config.Image}}' 2>/dev/null || true
}
live_service_is_healthy() {
  local service="$1" id status
  id=$(live_container_id "$service")
  [[ -n "$id" ]] || return 1
  status=$(docker inspect "$id" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' 2>/dev/null || true)
  [[ "$status" == healthy || "$status" == running ]]
}
state_ref() {
  local service="$1" component_digest
  component_digest=$(state_value "${service}_digest")
  [[ "$component_digest" =~ ^sha256:[0-9a-f]{64}$ ]] || return 1
  printf '%s\n' "$REGISTRY/$NAMESPACE/memoflow-$service@$component_digest"
}
fast_state_matches() {
  [[ "$(state_value status)" == DEPLOYED ]] || return 1
  [[ "$(state_value production_set_digest)" == "$production_set_label" ]] || return 1
  [[ "$(state_value runtime_digest)" == "$runtime_digest" ]] || return 1
  [[ "$(state_value release_sha)" == "$release_sha_label" ]] || return 1
  [[ "$(state_value control_plane_sha)" == "$control_plane_sha" ]] || return 1
  [[ "$(state_value migrator_digest)" =~ ^sha256:[0-9a-f]{64}$ ]] || return 1

  local service expected actual
  for service in api web powersync postgres redis caddy; do
    expected=$(state_ref "$service") || return 1
    actual=$(live_container_ref "$service") || return 1
    [[ "$actual" == "$expected" ]] || return 1
    live_service_is_healthy "$service" || return 1
  done
}

managed_status=$(state_value status)
managed_set=$(state_value production_set_digest)
if ! $CHECK_ONLY && ! $FORCE && fast_state_matches; then
  managed_release_tag=$(state_value release_tag)
  log "already deployed production release ${managed_release_tag:-unknown} set=$production_set_label fast_path=state+live-runtime; skipped component pulls"
  exit 0
fi

stage=$(mktemp -d "$STATE_DIR/production-runtime-next.XXXXXX")
runtime_container=$(docker create "$runtime_channel" /bin/true)
docker cp "$runtime_container:/runtime/production/." "$stage/"
docker rm "$runtime_container" >/dev/null
runtime_container=''
for required in production-set-v1.json production-set-v1.sha256 docker-compose.production.yml production-deploy-watch.sh install-production-deploy-watch.sh Caddyfile docker/powersync/powersync.yaml docker/powersync/sync-config.yaml systemd/memoflow-production-deploy-watch.service systemd/memoflow-production-deploy-watch.timer; do
  [[ -s "$stage/$required" ]] || fail "production runtime missing artifact: $required"
done
(
  cd "$stage"
  sha256sum -c production-set-v1.sha256 >/dev/null
)
raw_sha="sha256:$(sha256sum "$stage/production-set-v1.json" | awk '{print $1}')"
[[ "$raw_sha" == "$production_set_sha_label" ]] || fail 'embedded production-set file hash does not match runtime label'

manifest="$stage/production-set-v1.json"
[[ "$(jq -r .schema "$manifest")" == 'memoflow.production-set/v1' ]] || fail 'unsupported production-set schema'
release_tag=$(jq -r .releaseTag "$manifest")
release_sha=$(jq -r .gitSha "$manifest")
manifest_control_sha=$(jq -r .controlPlaneSha "$manifest")
production_set_digest=$(jq -r .digest "$manifest")
[[ "$release_tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+([+-][0-9A-Za-z.-]+)?$ ]] || fail 'invalid production release tag'
[[ "$release_sha" == "$release_sha_label" ]] || fail 'release revision label does not match production-set'
[[ "$manifest_control_sha" == "$control_plane_sha" ]] || fail 'control-plane label does not match production-set'
[[ "$production_set_digest" == "$production_set_label" ]] || fail 'production-set digest label mismatch'
[[ "$(jq -r 'has("watchtower") or (.runtime | has("watchtower"))' "$manifest")" == false ]] || fail 'Watchtower must not be part of production-set ownership'

app_ref() { jq -r ".images.$1.repository + \"@\" + .images.$1.digest" "$manifest"; }
runtime_ref() { jq -r ".runtime.$1.repository + \"@\" + .runtime.$1.digest" "$manifest"; }
for component in web api migrator; do
  repo=$(jq -r ".images.$component.repository" "$manifest")
  [[ "$repo" == "$REGISTRY/$NAMESPACE/memoflow-$component" ]] || fail "$component production repository mismatch"
  pull_exact "$(app_ref "$component")"
done
for component in postgres redis powersync caddy; do
  repo=$(jq -r ".runtime.$component.repository" "$manifest")
  [[ "$repo" == "$REGISTRY/$NAMESPACE/memoflow-$component" ]] || fail "$component production runtime repository mismatch"
  pull_exact "$(runtime_ref "$component")"
done

managed_status=$(state_value status)
managed_set=$(state_value production_set_digest)
if $CHECK_ONLY; then
  log "PRODUCTION_SELECTION=COHERENT release=$release_tag release_sha=$release_sha set=$production_set_digest managed=${managed_set:-none} status=${managed_status:-none}"
  exit 0
fi
if [[ "$managed_status" == BLOCKED ]] && ! $FORCE; then
  fail 'production deployment is BLOCKED; inspect evidence and use --force only after an operator recovery decision'
fi

cat > "$stage/runtime-images.env" <<ENV
API_IMAGE=$(app_ref api)
MIGRATOR_IMAGE=$(app_ref migrator)
WEB_IMAGE=$(app_ref web)
POSTGRES_IMAGE=$(runtime_ref postgres)
REDIS_IMAGE=$(runtime_ref redis)
POWERSYNC_IMAGE=$(runtime_ref powersync)
CADDY_IMAGE=$(runtime_ref caddy)
APP_VERSION=${release_tag#v}
ENV
chmod 0644 "$stage/runtime-images.env"

compose_root() {
  local root="$1"; shift
  docker compose -p "$COMPOSE_PROJECT" -f "$root/docker-compose.production.yml" --env-file "$SECRET_ENV" --env-file "$root/runtime-images.env" "$@"
}
compose_root "$stage" config -q

container_ref() {
  local root="$1" service="$2" id
  id=$(compose_root "$root" ps -q "$service" 2>/dev/null || true)
  [[ -n "$id" ]] || return 0
  docker inspect "$id" --format '{{.Config.Image}}' 2>/dev/null || true
}
service_is_healthy() {
  local root="$1" service="$2" id status
  id=$(compose_root "$root" ps -q "$service" 2>/dev/null || true)
  [[ -n "$id" ]] || return 1
  status=$(docker inspect "$id" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' 2>/dev/null || true)
  [[ "$status" == healthy || "$status" == running ]]
}
root_expected_ref() {
  local root="$1" service="$2" key
  key=$(printf '%s' "$service" | tr '[:lower:]' '[:upper:]')
  sed -n "s/^${key}_IMAGE=//p" "$root/runtime-images.env" 2>/dev/null | tail -1
}
runtime_root_matches_live() {
  local root="$1" service expected actual
  [[ -s "$root/runtime-images.env" ]] || return 1
  for service in api web powersync postgres redis caddy; do
    expected=$(root_expected_ref "$root" "$service")
    actual=$(live_container_ref "$service")
    [[ -n "$expected" && -n "$actual" && "$expected" == "$actual" ]] || return 1
  done
}
state_matches() {
  [[ "$managed_status" == DEPLOYED && "$managed_set" == "$production_set_digest" ]] || return 1
  local service expected
  for service in api web powersync postgres redis caddy; do
    case "$service" in
      api|web) expected=$(app_ref "$service") ;;
      powersync|postgres|redis|caddy) expected=$(runtime_ref "$service") ;;
    esac
    [[ "$(container_ref "$RUNTIME_ROOT" "$service")" == "$expected" ]] || return 1
    service_is_healthy "$RUNTIME_ROOT" "$service" || return 1
  done
}
if [[ -d "$RUNTIME_ROOT" ]] && ! $FORCE && state_matches; then
  log "already deployed production release $release_tag set=$production_set_digest"
  exit 0
fi

current_postgres=$(docker ps -q --filter "label=com.docker.compose.project=$COMPOSE_PROJECT" --filter 'label=com.docker.compose.service=postgres' | head -n1)
[[ -n "$current_postgres" ]] || fail 'current production postgres container not found'
current_postgres_ref=$(docker inspect "$current_postgres" --format '{{.Config.Image}}')
desired_postgres_ref=$(runtime_ref postgres)
if [[ "$current_postgres_ref" != "$desired_postgres_ref" ]]; then
  fail "PostgreSQL image change requires a dedicated datastore migration plan: $current_postgres_ref -> $desired_postgres_ref"
fi

current_powersync=$(docker ps -q --filter "label=com.docker.compose.project=$COMPOSE_PROJECT" --filter 'label=com.docker.compose.service=powersync' | head -n1)
[[ -n "$current_powersync" ]] || fail 'current production PowerSync container not found'
current_powersync_image=$(docker inspect "$current_powersync" --format '{{.Image}}')
desired_powersync_ref=$(runtime_ref powersync)
current_powersync_version=$(docker image inspect "$current_powersync_image" --format '{{index .Config.Labels "org.opencontainers.image.version"}}' 2>/dev/null || true)
desired_powersync_version=$(docker image inspect "$desired_powersync_ref" --format '{{index .Config.Labels "org.opencontainers.image.version"}}' 2>/dev/null || true)
if [[ "$current_powersync_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ && "$desired_powersync_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ && "$current_powersync_version" != "$desired_powersync_version" ]]; then
  oldest=$(printf '%s\n%s\n' "$current_powersync_version" "$desired_powersync_version" | sort -V | head -n1)
  if [[ "$oldest" == "$desired_powersync_version" ]]; then
    fail "PowerSync downgrade requires an explicit compatibility plan: $current_powersync_version -> $desired_powersync_version"
  fi
fi

backup_dir="$BACKUP_ROOT/${release_tag}-${production_set_digest#sha256:}-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$backup_dir"
chmod 0700 "$backup_dir"
docker ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}' --filter "label=com.docker.compose.project=$COMPOSE_PROJECT" > "$backup_dir/containers.txt"
mapfile -t current_ids < <(docker ps -q --filter "label=com.docker.compose.project=$COMPOSE_PROJECT")
[[ ${#current_ids[@]} -gt 0 ]] || fail 'no current production containers found for backup evidence'
docker inspect "${current_ids[@]}" > "$backup_dir/container-inspect.json"
docker exec "$current_postgres" sh -lc 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip -9 > "$backup_dir/postgres.sql.gz"
gzip -t "$backup_dir/postgres.sql.gz"
[[ -s "$backup_dir/postgres.sql.gz" ]] || fail 'PostgreSQL backup is empty'
sha256sum "$backup_dir/postgres.sql.gz" > "$backup_dir/postgres.sql.gz.sha256"
printf '%s\n' "$production_set_digest" > "$backup_dir/target-production-set.txt"
log "mandatory pre-migration backup complete: $backup_dir"

bootstrap_previous_runtime() {
  local previous="$1" legacy_config image
  rm -rf "$previous"
  mkdir -p "$previous/docker/powersync"
  cp "$LEGACY_ROOT/docker-compose.prod.yml" "$previous/docker-compose.production.yml"
  cp "$LEGACY_ROOT/Caddyfile" "$previous/Caddyfile"
  cp "$LEGACY_ROOT/docker/powersync/powersync.yaml" "$previous/docker/powersync/powersync.yaml"
  cp "$LEGACY_ROOT/docker/powersync/sync-config.yaml" "$previous/docker/powersync/sync-config.yaml"
  legacy_config=$(docker compose -p "$COMPOSE_PROJECT" -f "$LEGACY_ROOT/docker-compose.prod.yml" --env-file "$SECRET_ENV" config --format json)
  for service in api web powersync postgres redis caddy; do
    image=$(docker ps -q --filter "label=com.docker.compose.project=$COMPOSE_PROJECT" --filter "label=com.docker.compose.service=$service" | head -n1)
    [[ -n "$image" ]] || fail "cannot capture current $service container for rollback baseline"
    image=$(docker inspect "$image" --format '{{.Config.Image}}')
    printf '%s_IMAGE=%s\n' "$(printf '%s' "$service" | tr '[:lower:]' '[:upper:]')" "$image" >> "$previous/runtime-images.env"
  done
  printf 'MIGRATOR_IMAGE=%s\n' "$(jq -r .services.migrator.image <<<"$legacy_config")" >> "$previous/runtime-images.env"
  chmod 0600 "$previous/runtime-images.env"
}

rm -rf "$RUNTIME_ROOT.next"
mkdir -p "$RUNTIME_ROOT.next"
cp -a "$stage/." "$RUNTIME_ROOT.next/"
if [[ "$managed_status" == BLOCKED && $FORCE == true ]]; then
  [[ -d "$RUNTIME_ROOT.prev" ]] || fail 'forced BLOCKED recovery requires a preserved previous runtime baseline'
  runtime_root_matches_live "$RUNTIME_ROOT.prev" || fail 'forced BLOCKED recovery baseline does not match the current live production runtime'
  log 'forced BLOCKED recovery verified the preserved live rollback baseline'
  rm -rf "$RUNTIME_ROOT.failed"
  [[ ! -d "$RUNTIME_ROOT" ]] || mv "$RUNTIME_ROOT" "$RUNTIME_ROOT.failed"
else
  rm -rf "$RUNTIME_ROOT.prev"
  if [[ -d "$RUNTIME_ROOT" ]]; then
    mv "$RUNTIME_ROOT" "$RUNTIME_ROOT.prev"
  else
    bootstrap_previous_runtime "$RUNTIME_ROOT.prev"
  fi
fi
mv "$RUNTIME_ROOT.next" "$RUNTIME_ROOT"

migration_started=false
write_blocked_state() {
  local reason="${1:-error}" tmp
  tmp="$STATE_FILE.tmp.$$"
  cat > "$tmp" <<STATE
status=BLOCKED
release_tag=$release_tag
release_sha=$release_sha
control_plane_sha=$control_plane_sha
production_set_digest=$production_set_digest
runtime_digest=$runtime_digest
backup_dir=$backup_dir
blocked_reason=$reason
blocked_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
STATE
  chmod 0600 "$tmp"
  mv -f "$tmp" "$STATE_FILE"
}
rollback_pre_migration() {
  $migration_started && return 1
  [[ -d "$RUNTIME_ROOT.prev" && -s "$RUNTIME_ROOT.prev/runtime-images.env" ]] || return 1
  log 'restoring previous production runtime before migration boundary'
  rm -rf "$RUNTIME_ROOT.failed"
  mv "$RUNTIME_ROOT" "$RUNTIME_ROOT.failed"
  mv "$RUNTIME_ROOT.prev" "$RUNTIME_ROOT"
  compose_root "$RUNTIME_ROOT" up -d --no-build postgres redis api powersync web caddy >/dev/null 2>&1 || true
  return 0
}
on_failure() {
  local status=$?
  trap - ERR TERM INT HUP
  if ! rollback_pre_migration; then
    write_blocked_state error
    log 'production deployment reached migration boundary; recorded BLOCKED instead of blind rollback'
  fi
  exit "$status"
}
on_signal() {
  local signal="$1" status="$2"
  trap - ERR TERM INT HUP
  if ! rollback_pre_migration; then
    write_blocked_state "signal_$signal"
    log "production deployment interrupted by $signal after migration boundary; recorded BLOCKED"
  fi
  exit "$status"
}
trap on_failure ERR
trap 'on_signal TERM 143' TERM
trap 'on_signal INT 130' INT
trap 'on_signal HUP 129' HUP

wait_healthy() {
  local service="$1" timeout="${2:-180}" start id status
  start=$(date +%s)
  while :; do
    id=$(compose_root "$RUNTIME_ROOT" ps -q "$service" 2>/dev/null || true)
    if [[ -n "$id" ]]; then
      status=$(docker inspect "$id" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' 2>/dev/null || true)
      [[ "$status" == healthy || "$status" == running ]] && return 0
    fi
    if (( $(date +%s) - start >= timeout )); then
      [[ -z "${id:-}" ]] || docker logs --tail 100 "$id" 2>&1 || true
      return 1
    fi
    sleep 2
  done
}
require_ref() {
  local service="$1" expected="$2" actual
  actual=$(container_ref "$RUNTIME_ROOT" "$service")
  [[ "$actual" == "$expected" ]] || fail "$service runtime image mismatch: $actual != $expected"
}
probe_host_caddy_url() {
  local url="$1" authority host port
  case "$url" in
    https://*)
      authority=${url#https://}
      port=443
      ;;
    http://*)
      authority=${url#http://}
      port=80
      ;;
    *) fail "unsupported production host probe URL: $url" ;;
  esac
  authority=${authority%%/*}
  [[ -n "$authority" ]] || fail "production host probe URL has no authority: $url"
  if [[ "$authority" == *:* ]]; then
    host=${authority%%:*}
    port=${authority##*:}
  else
    host=$authority
  fi
  [[ "$host" =~ ^[A-Za-z0-9.-]+$ ]] || fail "production host probe has invalid hostname: $url"
  [[ "$port" =~ ^[0-9]+$ ]] || fail "production host probe has invalid port: $url"
  curl -fsS --retry 6 --retry-delay 2 --connect-timeout 5 --max-time 20 \
    --resolve "$host:$port:127.0.0.1" "$url" >/dev/null
}

log "deploying production release $release_tag set=$production_set_digest"
compose_root "$RUNTIME_ROOT" up -d --no-build postgres redis
wait_healthy postgres 180
wait_healthy redis 120
compose_root "$RUNTIME_ROOT" stop caddy web powersync api >/dev/null 2>&1 || true
compose_root "$RUNTIME_ROOT" rm -f migrator >/dev/null 2>&1 || true
migration_started=true
compose_root "$RUNTIME_ROOT" run --rm --no-deps migrator
compose_root "$RUNTIME_ROOT" up -d --no-build --no-deps api
wait_healthy api 240
require_ref api "$(app_ref api)"
compose_root "$RUNTIME_ROOT" up -d --no-build --no-deps powersync
wait_healthy powersync 180
require_ref powersync "$(runtime_ref powersync)"
compose_root "$RUNTIME_ROOT" up -d --no-build --no-deps web
wait_healthy web 180
require_ref web "$(app_ref web)"
compose_root "$RUNTIME_ROOT" up -d --no-build --no-deps caddy
wait_healthy caddy 120
require_ref caddy "$(runtime_ref caddy)"

# Validate the canonical HTTPS Host/SNI routes through the local Caddy listener.
# Public Internet reachability is an out-of-band acceptance check; the host
# transaction must not depend on Alibaba DNS/hairpin behavior.
for url in "${PRODUCTION_EXTERNAL_API_URL:-}" "${PRODUCTION_EXTERNAL_WEB_URL:-}" "${PRODUCTION_EXTERNAL_POWERSYNC_URL:-}"; do
  [[ -z "$url" ]] || probe_host_caddy_url "$url"
done
log 'host-local Caddy route probes passed'

install -m 0755 "$RUNTIME_ROOT/production-deploy-watch.sh" "$BIN_PATH"
install -m 0644 "$RUNTIME_ROOT/systemd/memoflow-production-deploy-watch.service" "$SYSTEMD_DIR/memoflow-production-deploy-watch.service"
install -m 0644 "$RUNTIME_ROOT/systemd/memoflow-production-deploy-watch.timer" "$SYSTEMD_DIR/memoflow-production-deploy-watch.timer"
systemctl daemon-reload

state_tmp="$STATE_FILE.tmp.$$"
cat > "$state_tmp" <<STATE
status=DEPLOYED
release_tag=$release_tag
release_sha=$release_sha
control_plane_sha=$control_plane_sha
production_set_digest=$production_set_digest
runtime_digest=$runtime_digest
web_digest=$(jq -r .images.web.digest "$manifest")
api_digest=$(jq -r .images.api.digest "$manifest")
migrator_digest=$(jq -r .images.migrator.digest "$manifest")
postgres_digest=$(jq -r .runtime.postgres.digest "$manifest")
redis_digest=$(jq -r .runtime.redis.digest "$manifest")
powersync_digest=$(jq -r .runtime.powersync.digest "$manifest")
caddy_digest=$(jq -r .runtime.caddy.digest "$manifest")
backup_dir=$backup_dir
deployed_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
STATE
chmod 0600 "$state_tmp"
mv -f "$state_tmp" "$STATE_FILE"
rm -rf "$RUNTIME_ROOT.prev" "$RUNTIME_ROOT.failed"
trap - ERR TERM INT HUP
log "PRODUCTION_DEPLOY=PASS release=$release_tag release_sha=$release_sha set=$production_set_digest"
