# MemoFlow canonical production delivery

> Status: IMPLEMENTED / live Alibaba acceptance pending.

This directory is the runtime authority for Delivery Platform V3 production deployment. It replaces the historical model where application containers could be changed independently through mutable image tags or Watchtower.

## Authority chain

```text
Published GitHub Release
  -> release-manifest.json + candidate-set-v1.json
  -> Deploy Production(vX.Y.Z)
  -> memoflow.production-set/v1
  -> memoflow-production-runtime:set-<production-set-digest>
  -> production-selected control pointer
  -> Alibaba production watcher
  -> exact repository@sha256 runtime
```

`Deploy Production` does not SSH into Alibaba ECS and does not move Web/API/Migrator independently. It verifies the Published release, exact tag SHA, successful source main CI, candidate-set identity, ACR/GHCR application digest parity, and release-owned runtime mirror digests. Only then does it move the single `memoflow-production-runtime:production-selected` pointer.

`memoflow.production-set/v1` binds the immutable release identity, Server digests, runtime dependency digests, and `controlPlaneSha`. Runtime dependencies are read from the **exact release SHA**, not from selector HEAD, so selecting an older release cannot silently pair it with newer dependency pins.

## Runtime ownership

`docker-compose.production.yml` accepts only exact image references supplied by the watcher:

- API
- Migrator
- Web
- PostgreSQL
- Redis
- PowerSync
- Caddy

There is no `prod-latest`, registry/tag fallback, or Watchtower service in the canonical runtime.

The historical `/opt/memoflow/docker-compose.prod.yml` is retained only as first-cutover rollback evidence. After the first successful canonical deployment, the watcher carries its own previous-runtime snapshot between deployments.

## Install and acceptance

After `Deploy Production` has selected a Published release, bootstrap from the selected ACR control artifact itself; a repository checkout is not required on Alibaba:

```bash
envfile=/opt/memoflow/.env.production.local
registry="$(sed -n 's/^REGISTRY=//p' "$envfile" | tail -1 | tr -d '\r')"
namespace="$(sed -n 's/^IMAGE_NAMESPACE=//p' "$envfile" | tail -1 | tr -d '\r')"
control_ref="$registry/$namespace/memoflow-production-runtime:production-selected"
docker pull "$control_ref"
cid="$(docker create "$control_ref" /bin/true)"
bootstrap_dir=/tmp/memoflow-production-bootstrap
rm -rf "$bootstrap_dir"
mkdir -p "$bootstrap_dir"
docker cp "$cid:/runtime/production/." "$bootstrap_dir/"
docker rm "$cid"
"$bootstrap_dir/install-production-deploy-watch.sh"
/usr/local/bin/memoflow-production-deploy-watch --check-only
systemctl start memoflow-production-deploy-watch.service
cat /var/lib/memoflow-delivery/production-deploy-state
```

The bootstrap reads only the existing host deployment coordinates/secrets locally; it does not print or copy them into the control artifact.

The installer deliberately does **not** enable the timer by default. Enable periodic reconciliation only after the first controlled rollout and replay have passed:

```bash
"$bootstrap_dir/install-production-deploy-watch.sh" --enable
```

## Transaction boundary

The watcher owns one deployment transaction. Its two-minute timer first reconciles only the small `production-selected` control pointer. If the recorded `DEPLOYED` state, control digest, release/control-plane identity, exact live container refs, and health all still match, it exits on a fast path without extracting the runtime bundle or pulling any application/runtime component image. A changed selection or runtime drift falls through to the full fail-closed transaction:

```text
lock
-> pull/inspect production-selected control pointer
-> unchanged state + exact healthy live runtime => fast exit (no component pulls)
-> validate production-selected artifact
-> pull every exact digest
-> reject unexpected PostgreSQL image changes
-> mandatory PostgreSQL backup
-> capture previous runtime
-> PostgreSQL / Redis health
-> stop API / PowerSync / Web / Caddy
-> Migrator
-> API
-> PowerSync
-> Web
-> Caddy
-> external health
-> atomic production-deploy-state
```

A failure before Migrator starts may restore the previous runtime automatically. Once Migrator has started, any uncertain failure records `status=BLOCKED` with backup evidence instead of blindly rolling application images backward across a possibly changed schema.

## State and recovery

Canonical state is stored at:

```text
/var/lib/memoflow-delivery/production-deploy-state
```

`DEPLOYED` records release SHA, control-plane SHA, production-set digest, control artifact digest, all application/runtime digests, backup directory, and deployment time.

`BLOCKED` is an operator gate. Inspect the backup and deployment evidence before using `--force`; never delete migration history or move an immutable release tag to force recovery.
