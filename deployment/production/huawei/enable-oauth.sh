#!/usr/bin/env bash
# Post-release OAuth activation is separate from the schema-migration release.
# No auth tokens or production secrets are logged. Existing Caddy and data
# services are never updated by this script.
set -Eeuo pipefail
umask 077
MODE=${1:-}
[[ "$MODE" == --read-only || "$MODE" == --read-write ]] || { echo 'usage: enable-oauth.sh --read-only|--read-write' >&2; exit 2; }
[[ $(id -u) == 0 ]] || { echo 'requires root' >&2; exit 2; }
RUNTIME=${MEMOFLOW_HUAWEI_RUNTIME:-/opt/memoflow/runtime}
SECRET=${MEMOFLOW_HUAWEI_SECRET:-/opt/memoflow/.env.production.local}
STATE_ROOT=${MEMOFLOW_HUAWEI_STATE_ROOT:-/var/lib/memoflow-huawei-delivery}
[[ -f "$SECRET" && -f "$RUNTIME/runtime-images.env" && -f "$RUNTIME/docker-compose.production.yml" ]] || exit 2
[[ $(sed -n 's/^status=//p' "$STATE_ROOT/deploy-state" | tail -1) == DEPLOYED ]] || { echo 'cannot enable OAuth without verified Huawei production release' >&2; exit 2; }
exec 9>"$STATE_ROOT/deploy.lock"
flock -n 9 || { echo 'production transaction already running' >&2; exit 2; }
for key in EAG_READ_PILOT_ENABLED EAG_WRITE_ENABLED EAG_AUDIENCE MEMOFLOW_WEB_URL AUTH_BASE_URL EAG_CURSOR_SECRET; do
  [[ $(grep -c "^$key=" "$SECRET") == 1 ]] || { echo "missing required $key" >&2; exit 2; }
done
[[ $(sed -n 's/^EAG_READ_PILOT_ENABLED=//p' "$SECRET") == 1 && $(sed -n 's/^EAG_WRITE_ENABLED=//p' "$SECRET") == 1 ]] || { echo 'Gateway parent flags not enabled' >&2; exit 2; }
[[ $(sed -n 's/^EAG_AUDIENCE=//p' "$SECRET") == https://memoflowapi.bakersean.top/mcp ]] || { echo 'unexpected OAuth resource audience' >&2; exit 2; }
[[ $(sed -n 's/^MEMOFLOW_WEB_URL=//p' "$SECRET") == https://memoflow.bakersean.top && $(sed -n 's/^AUTH_BASE_URL=//p' "$SECRET") == https://memoflow.bakersean.top/api/auth ]] || { echo 'unexpected OAuth issuer/web origin' >&2; exit 2; }
# The server already uses a cursor secret; this checks presence without exposing it.
[[ $(sed -n 's/^EAG_CURSOR_SECRET=//p' "$SECRET" | wc -c) -gt 32 ]] || { echo 'cursor secret missing/short' >&2; exit 2; }
WRITE=0; [[ "$MODE" == --read-only ]] || WRITE=1
LIST='https://chatgpt.com/oauth/client.json,https://chatgpt.com/oauth/codex/client.json,https://claude.ai/oauth/claude-code-client-metadata'
BACKUP="$STATE_ROOT/backups/oauth-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -m 0700 "$BACKUP"
cp -p "$SECRET" "$BACKUP/production.before.env"
TMP="$SECRET.next-oauth.$$"
cleanup(){ rm -f "$TMP"; }
trap cleanup EXIT
python3 - "$SECRET" "$TMP" "$WRITE" "$LIST" <<'PY'
from pathlib import Path
import sys
source, target, write, client_ids = sys.argv[1:]
settings = {'EAG_OAUTH_ENABLED': '1', 'EAG_OAUTH_WRITE_ENABLED': write, 'EAG_OAUTH_CLIENT_IDS': client_ids}
lines = Path(source).read_text().splitlines()
for key, value in settings.items():
    found = [i for i, line in enumerate(lines) if line.startswith(key + '=')]
    if len(found) > 1:
        raise SystemExit('duplicate ' + key)
    if found:
        lines[found[0]] = key + '=' + value
    else:
        lines.append(key + '=' + value)
Path(target).write_text('\n'.join(lines) + '\n')
PY
chmod 0600 "$TMP"
BASE_IDS="$(for service in postgres redis powersync caddy; do docker ps -q --filter 'label=com.docker.compose.project=memoflow' --filter "label=com.docker.compose.service=$service" | head -n1; done)"
rollback(){ local rc=$?; trap - ERR INT TERM HUP; cp "$BACKUP/production.before.env" "$SECRET"; docker compose -p memoflow --project-directory "$RUNTIME" -f "$RUNTIME/docker-compose.production.yml" --env-file "$SECRET" --env-file "$RUNTIME/runtime-images.env" up -d --no-build --no-deps api >/dev/null 2>&1 || true; echo 'OAUTH_ACTIVATION=ROLLED_BACK' >&2; exit "$rc"; }
trap rollback ERR INT TERM HUP
mv -f "$TMP" "$SECRET"
docker compose -p memoflow --project-directory "$RUNTIME" -f "$RUNTIME/docker-compose.production.yml" --env-file "$SECRET" --env-file "$RUNTIME/runtime-images.env" up -d --no-build --no-deps api >/dev/null
for i in $(seq 1 120); do
  id=$(docker ps -q --filter 'label=com.docker.compose.project=memoflow' --filter 'label=com.docker.compose.service=api' | head -n1)
  if [[ -n "$id" && $(docker inspect "$id" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}') == healthy ]]; then break; fi
  sleep 2
done
[[ -n "$id" && $(docker inspect "$id" --format '{{.State.Health.Status}}') == healthy ]]
[[ $(docker exec "$id" printenv EAG_OAUTH_ENABLED) == 1 ]]
[[ $(docker exec "$id" printenv EAG_OAUTH_WRITE_ENABLED) == "$WRITE" ]]
[[ $(docker exec "$id" printenv EAG_OAUTH_CLIENT_IDS) == "$LIST" ]]
[[ "$(for service in postgres redis powersync caddy; do docker ps -q --filter 'label=com.docker.compose.project=memoflow' --filter "label=com.docker.compose.service=$service" | head -n1; done)" == "$BASE_IDS" ]]
# Both metadata URLs must be JSON on their correct HTTPS origins, not SPA HTML.
api_metadata=$(curl -fsS --max-time 20 --resolve memoflowapi.bakersean.top:443:127.0.0.1 'https://memoflowapi.bakersean.top/.well-known/oauth-protected-resource/mcp')
issuer_metadata=$(curl -fsS --max-time 20 --resolve memoflow.bakersean.top:443:127.0.0.1 'https://memoflow.bakersean.top/.well-known/oauth-authorization-server/api/auth')
python3 -c 'import json,sys; m=json.loads(sys.argv[1]); assert m.get("resource")=="https://memoflowapi.bakersean.top/mcp"; print("RESOURCE_METADATA=PASS")' "$api_metadata"
python3 -c 'import json,sys; m=json.loads(sys.argv[1]); assert m.get("authorization_endpoint") and m.get("token_endpoint") and m.get("issuer"); print("ISSUER_METADATA=PASS")' "$issuer_metadata"
HEADERS=$(mktemp "$STATE_ROOT/oauth-headers.XXXXXX")
trap 'rm -f "$HEADERS"' EXIT
status=$(curl -sS --max-time 20 --resolve memoflowapi.bakersean.top:443:127.0.0.1 -o /dev/null -D "$HEADERS" -w '%{http_code}' -H 'content-type: application/json' --data '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' 'https://memoflowapi.bakersean.top/mcp')
[[ "$status" == 401 ]] && grep -qi 'WWW-Authenticate:.*resource_metadata=' "$HEADERS"
rm -f "$HEADERS"
trap - ERR INT TERM HUP
printf 'mode=%s\nupdated_at=%s\nbackup_dir=%s\n' "$MODE" "$(date -u +%FT%TZ)" "$BACKUP" > "$STATE_ROOT/oauth-state.next.$$"
chmod 0600 "$STATE_ROOT/oauth-state.next.$$"
mv -f "$STATE_ROOT/oauth-state.next.$$" "$STATE_ROOT/oauth-state"
echo "OAUTH_ACTIVATION=PASS mode=$MODE"
