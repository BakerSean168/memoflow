#!/usr/bin/env bash
# Huawei production app-only release executor. Consumes the verified OCI
# production-selected pointer; never recreates PostgreSQL, Redis, PowerSync,
# Caddy, volumes, network or public ports.
set -Eeuo pipefail
umask 077
MODE=${1:---check-only}
[[ "$MODE" == --check-only || "$MODE" == --apply ]] || { echo 'usage: deploy.sh [--check-only|--apply]' >&2; exit 2; }
[[ $(id -u) == 0 ]] || { echo 'must run as root' >&2; exit 2; }
for cmd in docker jq python3 curl sha256sum gzip flock; do command -v "$cmd" >/dev/null || { echo "missing $cmd" >&2; exit 2; }; done
RUNTIME=${MEMOFLOW_HUAWEI_RUNTIME:-/opt/memoflow/runtime}
SECRET=${MEMOFLOW_HUAWEI_SECRET:-/opt/memoflow/.env.production.local}
STATE_ROOT=${MEMOFLOW_HUAWEI_STATE_ROOT:-/var/lib/memoflow-huawei-delivery}
CONTROL=ghcr.io/bakersean168/memoflow-production-runtime:production-selected
[[ -f "$RUNTIME/docker-compose.production.yml" && -f "$RUNTIME/release-images.env" && -f "$RUNTIME/runtime-images.env" && -f "$SECRET" ]] || { echo 'missing canonical Huawei production files' >&2; exit 2; }
mkdir -p "$STATE_ROOT/backups"
chmod 0700 "$STATE_ROOT" "$STATE_ROOT/backups"
exec 9>"$STATE_ROOT/deploy.lock"
flock -n 9 || { echo 'another Huawei release transaction is active' >&2; exit 2; }
log(){ printf '[%s] %s\n' "$(date -u +%FT%TZ)" "$*"; }
fail(){ echo "HUAWEI_DEPLOY_REJECTED: $*" >&2; return 1; }
value(){ [[ -f "$1" ]] || return 0; sed -n "s/^$2=//p" "$1" | tail -n1 | tr -d '\r'; }
SVC=(postgres redis powersync caddy api web)
label(){ docker image inspect "$1" --format "{{index .Config.Labels \"$2\"}}"; }
container(){ docker ps -q --filter 'label=com.docker.compose.project=memoflow' --filter "label=com.docker.compose.service=$1" | head -n1; }
health(){ local id; id=$(container "$1"); [[ -n "$id" ]] || fail "missing $1 container"; docker inspect "$id" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}'; }
compose(){ docker compose -p memoflow --project-directory "$RUNTIME" -f "$1" --env-file "$SECRET" --env-file "$2" "${@:3}"; }
require_digest(){ [[ "$1" =~ ^sha256:[0-9a-f]{64}$ ]] || fail "invalid $2 digest"; }
require_ref(){ local ref="$1" got; got=$(docker image inspect "$ref" --format '{{range .RepoDigests}}{{println .}}{{end}}'); grep -Fxq "$ref" <<<"$got" || fail "image digest missing from $ref"; }
ORIG_COMPOSE="$RUNTIME/docker-compose.production.yml"
ORIG_ENV="$RUNTIME/runtime-images.env"
STAGE=$(mktemp -d "$STATE_ROOT/control.XXXXXXXX")
NEXT_COMPOSE="$RUNTIME/.candidate-compose-$$.yml"
NEXT_ENV="$RUNTIME/.candidate-images-$$.env"
CONTROL_CONTAINER=''
MIGRATION_STARTED=0
BACKUP=''
cleanup(){ if [[ -n "$CONTROL_CONTAINER" ]]; then docker rm -f "$CONTROL_CONTAINER" >/dev/null 2>&1 || true; fi; rm -rf "$STAGE"; rm -f "$NEXT_COMPOSE" "$NEXT_ENV"; }
record(){ local status="$1" path="$STATE_ROOT/deploy-state"; printf 'status=%s\nrelease_tag=%s\nrelease_sha=%s\nproduction_set_digest=%s\nbackup_dir=%s\nupdated_at=%s\n' "$status" "$RELEASE_TAG" "$SOURCE_SHA" "$SET_DIGEST" "$BACKUP" "$(date -u +%FT%TZ)" > "$path.next.$$"; chmod 0600 "$path.next.$$"; mv "$path.next.$$" "$path"; }
recover(){ local rc=$?; trap - ERR INT TERM HUP; if [[ $MIGRATION_STARTED == 1 ]]; then record BLOCKED; log 'migration boundary crossed; recorded BLOCKED, no blind database rollback'; elif [[ -n "$BACKUP" ]]; then log 'restoring previous app services before migration boundary'; compose "$ORIG_COMPOSE" "$ORIG_ENV" up -d --no-build --no-deps api web >/dev/null 2>&1 || true; record PRE_MIGRATION_FAILED; fi; cleanup; exit "$rc"; }
trap cleanup EXIT
log 'pulling immutable production-selected control artifact'
docker pull "$CONTROL" >/dev/null
SOURCE_SHA=$(label "$CONTROL" io.memoflow.release.revision)
CONTROL_SHA=$(label "$CONTROL" org.opencontainers.image.revision)
SET_DIGEST=$(label "$CONTROL" io.memoflow.production-set.digest)
SET_HASH=$(label "$CONTROL" io.memoflow.production-set.sha256)
[[ "$SOURCE_SHA" =~ ^[a-f0-9]{40}$ && "$CONTROL_SHA" =~ ^[a-f0-9]{40}$ ]] || fail 'invalid control/source revision labels'
require_digest "$SET_DIGEST" production-set
require_digest "$SET_HASH" production-set-file
[[ $(docker image inspect "$CONTROL" --format '{{.Architecture}}') == amd64 ]] || fail 'Huawei release control must be amd64'
CONTROL_CONTAINER=$(docker create "$CONTROL" /bin/true)
docker cp "$CONTROL_CONTAINER:/runtime/production/." "$STAGE/" >/dev/null
docker rm "$CONTROL_CONTAINER" >/dev/null
CONTROL_CONTAINER=''
MANIFEST="$STAGE/production-set-v1.json"
[[ -s "$MANIFEST" && -s "$STAGE/huawei/verify-candidate.py" && -s "$STAGE/docker-compose.production.yml" ]] || fail 'selected control bundle missing Huawei release components'
[[ "sha256:$(sha256sum "$MANIFEST" | cut -d' ' -f1)" == "$SET_HASH" ]] || fail 'selected production-set bytes do not match OCI label'
[[ $(jq -r .schema "$MANIFEST") == memoflow.production-set/v1 ]] || fail 'unexpected production-set schema'
[[ $(jq -r .gitSha "$MANIFEST") == "$SOURCE_SHA" && $(jq -r .controlPlaneSha "$MANIFEST") == "$CONTROL_SHA" && $(jq -r .digest "$MANIFEST") == "$SET_DIGEST" ]] || fail 'selected manifest/control label drift'
RELEASE_TAG=$(jq -r .releaseTag "$MANIFEST")
VERSION=$(jq -r .version "$MANIFEST")
[[ "$RELEASE_TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-nightly\.[0-9]{8}\.[0-9]+)?$ && "$VERSION" == "${RELEASE_TAG#v}" ]] || fail 'invalid published release version'
[[ "$(value "$STATE_ROOT/deploy-state" status)" != BLOCKED ]] || fail 'previous deployment BLOCKED; inspect preserved backup first'
# First adoption is anchored to the exact inspected Huawei baseline. Later
# deployments use the last successful release receipt. Older Published releases
# remain available for a separately reviewed data/schema recovery, not this
# automatic migrator transaction.
BASELINE_SHA=e1c98de93c71f99ab87a0e895345531213f37107
BASELINE_TAG=v0.23.0-nightly.20261116.134
PREVIOUS_TAG=$(value "$STATE_ROOT/deploy-state" release_tag)
if [[ -z "$PREVIOUS_TAG" ]]; then
  PREVIOUS_TAG=$BASELINE_TAG
  current_api_ref=$(value "$RUNTIME/release-images.env" API_IMAGE)
  [[ "$(label "$current_api_ref" org.opencontainers.image.revision)" == "$BASELINE_SHA" ]] || fail 'unknown first-adoption release source; manual operator reconciliation required'
fi
python3 - "$PREVIOUS_TAG" "$RELEASE_TAG" <<'PY_VERSION'
import re,sys
pattern=re.compile(r'^v(\d+)\.(\d+)\.(\d+)(?:-nightly\.(\d{8})\.(\d+))?$')
old,new=(pattern.fullmatch(value) for value in sys.argv[1:])
if not old or not new:
    raise SystemExit('invalid previous or selected release tag')
def key(match):
    major,minor,patch,day,number=match.groups()
    return (int(major),int(minor),int(patch),int(day or 0),int(number or 0))
if key(new) < key(old):
    raise SystemExit('selected release is older than current production; no automatic schema downgrade')
PY_VERSION
# Current release-images.env must identify the actual running image bytes. The
# local tags were verified against GHCR on first Huawei deployment.
for key in POSTGRES REDIS POWERSYNC CADDY; do
  component=${key,,}
  current_ref=$(value "$RUNTIME/release-images.env" "${key}_IMAGE")
  expected_digest=$(jq -r ".runtime.$component.digest" "$MANIFEST")
  require_digest "$expected_digest" "$component"
  [[ "$current_ref" == "ghcr.io/bakersean168/memoflow-$component@$expected_digest" ]] || fail "$component runtime pin differs from selected release; dedicated runtime migration required"
  docker image inspect "$current_ref" >/dev/null 2>&1 || docker pull "$current_ref" >/dev/null
  require_ref "$current_ref"
done
for key in API WEB MIGRATOR; do
  component=${key,,}
  digest=$(jq -r ".images.$component.digest" "$MANIFEST")
  require_digest "$digest" "$component"
  ref="ghcr.io/bakersean168/memoflow-$component@$digest"
  case "$key" in API) API_REF=$ref;; WEB) WEB_REF=$ref;; MIGRATOR) MIGRATOR_REF=$ref;; esac
  docker pull "$ref" >/dev/null
  require_ref "$ref"
  [[ $(docker image inspect "$ref" --format '{{.Architecture}}') == amd64 ]] || fail "$component image architecture mismatch"
  [[ $(label "$ref" org.opencontainers.image.revision) == "$SOURCE_SHA" ]] || fail "$component release source SHA mismatch"
done
# Refuse stale Compose, unexpected containers or substituted local image tags.
for key in "${SVC[@]}"; do
  id=$(container "$key"); [[ -n "$id" ]] || fail "missing $key service"
  case "$key" in caddy) [[ $(health "$key") == running || $(health "$key") == healthy ]] || fail 'Caddy not running';; *) [[ $(health "$key") == healthy ]] || fail "$key not healthy";; esac
  old_ref=$(value "$ORIG_ENV" "${key^^}_IMAGE")
  actual_ref=$(docker inspect "$id" --format '{{.Config.Image}}')
  [[ "$actual_ref" == "$old_ref" ]] || fail "running $key image differs from current Compose env"
  release_ref=$(value "$RUNTIME/release-images.env" "${key^^}_IMAGE")
  local_id=$(docker image inspect "$actual_ref" --format '{{.Id}}')
  release_id=$(docker image inspect "$release_ref" --format '{{.Id}}')
  [[ "$local_id" == "$release_id" ]] || fail "$key running image bytes differ from immutable recorded release"
done
API_ID=$(container api); WEB_ID=$(container web)
DATA_IDS="$(for key in postgres redis powersync caddy; do printf '%s=%s\n' "$key" "$(container "$key")"; done)"
# Candidate lives beside the production YAML so relative mounts resolve to the
# existing PowerSync config and Caddyfile; no alternate networks or data paths.
cp "$STAGE/docker-compose.production.yml" "$NEXT_COMPOSE"
python3 - "$ORIG_ENV" "$NEXT_ENV" "$API_REF" "$WEB_REF" "$MIGRATOR_REF" "$VERSION" <<'PY'
import pathlib,sys
original,destination,*values=sys.argv[1:]
keys=('API_IMAGE','WEB_IMAGE','MIGRATOR_IMAGE','APP_VERSION')
entries=dict(zip(keys,values))
lines=pathlib.Path(original).read_text().splitlines()
for k in keys:
    assert sum(line.startswith(k+'=') for line in lines)==1, 'missing or duplicate runtime env '+k
out=[k+'='+entries[k] if k in entries else line for line in lines for k in [line.split('=',1)[0]]]
pathlib.Path(destination).write_text('\n'.join(out)+'\n')
PY
compose "$ORIG_COMPOSE" "$ORIG_ENV" config --format json > "$STAGE/current.json"
compose "$NEXT_COMPOSE" "$NEXT_ENV" config --format json > "$STAGE/candidate.json"
python3 "$STAGE/huawei/verify-candidate.py" "$STAGE/current.json" "$STAGE/candidate.json" "$API_REF" "$WEB_REF" "$MIGRATOR_REF" "$VERSION"
log "HUAWEI_PREFLIGHT=PASS release=$RELEASE_TAG source=$SOURCE_SHA set=$SET_DIGEST"
if [[ "$MODE" == --check-only ]]; then exit 0; fi
if [[ "$(value "$STATE_ROOT/deploy-state" release_sha)" == "$SOURCE_SHA" && $(docker inspect "$API_ID" --format '{{.Config.Image}}') == "$API_REF" && $(docker inspect "$WEB_ID" --format '{{.Config.Image}}') == "$WEB_REF" ]]; then
  log "HUAWEI_DEPLOY=NO_CHANGE release=$RELEASE_TAG"
  exit 0
fi
trap recover ERR INT TERM HUP
BACKUP="$STATE_ROOT/backups/${RELEASE_TAG}-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -m 0700 "$BACKUP"
cp -p "$ORIG_COMPOSE" "$ORIG_ENV" "$RUNTIME/release-images.env" "$SECRET" "$BACKUP/"
printf '%s\n' "$DATA_IDS" > "$BACKUP/retained-containers.txt"
# Mandatory crash-consistent logical database snapshot before any application
# process is stopped; the archive stays root-only on the production host.
docker exec "$(container postgres)" sh -lc 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip -9 > "$BACKUP/postgres.sql.gz"
gzip -t "$BACKUP/postgres.sql.gz"
[[ -s "$BACKUP/postgres.sql.gz" ]] || fail 'empty database backup'
sha256sum "$BACKUP/postgres.sql.gz" > "$BACKUP/postgres.sql.gz.sha256"
record APPLYING
log "backup verified: $BACKUP"
compose "$ORIG_COMPOSE" "$ORIG_ENV" stop web api >/dev/null
MIGRATION_STARTED=1
log 'MIGRATOR_START'
compose "$NEXT_COMPOSE" "$NEXT_ENV" run --rm --no-deps -T migrator >/dev/null
log 'MIGRATOR_PASS'
for service in api web; do
  compose "$NEXT_COMPOSE" "$NEXT_ENV" up -d --no-build --no-deps "$service" >/dev/null
  until [[ "$(health "$service")" == healthy ]]; do
    (( ${TIMEOUT:-0} < 120 )) || fail "$service health timeout"
    sleep 2
    TIMEOUT=$(( ${TIMEOUT:-0} + 1 ))
  done
  TIMEOUT=0
  expected_ref="$API_REF"; [[ "$service" != web ]] || expected_ref="$WEB_REF"
  [[ $(docker inspect "$(container "$service")" --format '{{.Config.Image}}') == "$expected_ref" ]] || fail "$service wrong image after rollout"
done
[[ "$(for key in postgres redis powersync caddy; do printf '%s=%s\n' "$key" "$(container "$key")"; done)" == "$DATA_IDS" ]] || fail 'retained infrastructure container unexpectedly changed'
for key in postgres redis powersync; do [[ $(health "$key") == healthy ]] || fail "$key lost health"; done
for url in 'https://memoflow.bakersean.top/' 'https://memoflowapi.bakersean.top/healthz' 'https://memoflowsync.bakersean.top/probes/liveness'; do
  host=${url#https://}; host=${host%%/*}
  curl -fsS --connect-timeout 5 --max-time 20 --resolve "$host:443:127.0.0.1" "$url" >/dev/null || fail "HTTPS failed for $host"
done
install -m 0644 "$NEXT_COMPOSE" "$ORIG_COMPOSE.promote.$$"
install -m 0600 "$NEXT_ENV" "$ORIG_ENV.promote.$$"
mv -f "$ORIG_COMPOSE.promote.$$" "$ORIG_COMPOSE"
mv -f "$ORIG_ENV.promote.$$" "$ORIG_ENV"
python3 - "$RUNTIME/release-images.env" "$API_REF" "$WEB_REF" "$MIGRATOR_REF" "$VERSION" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1]); keys=('API_IMAGE','WEB_IMAGE','MIGRATOR_IMAGE','APP_VERSION'); subs=dict(zip(keys,sys.argv[2:]))
lines=p.read_text().splitlines(); assert all(sum(l.startswith(k+'=') for l in lines)==1 for k in keys)
next_file=p.with_name(p.name+'.next-release')
next_file.write_text('\n'.join(k+'='+subs[k] if k in subs else line for line in lines for k in [line.split('=',1)[0]])+'\n')
next_file.replace(p)
PY
record DEPLOYED
trap - ERR INT TERM HUP
log "HUAWEI_DEPLOY=PASS release=$RELEASE_TAG source=$SOURCE_SHA set=$SET_DIGEST"
