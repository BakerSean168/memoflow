# Oracle2 native production-selected watcher

Oracle2 production is a separate Compose project at /opt/memoflow-oracle2. Its
shared CPA Caddy is a different project and owns host ports 80/443.
Never install or run deployment/production/install-production-deploy-watch.sh
(the former Alibaba installer) on Oracle2.

## Trust and ownership

The GitHub Actions Deploy Production workflow selects one Published Release,
checks its main CI/source identity and dual-registry digest parity, and moves a
single multi-architecture production-selected control OCI pointer. The Oracle2
watcher reads that pointer and checks OCI control labels against the embedded
production-set-v1.json byte hash, release revision, and immutable image refs.

- Only the existing API and Web services and one-shot Migrator may switch images.
- The DB/Redis/PowerSync runtime pins and shared CPA Caddy pin must not change.
  A change requires a separate, explicitly reviewed migration, not automatic rollout.
- No network, Caddy, port, bind-mount, healthcheck or named-volume changes are
  permitted. The existing oracle2-topology-preflight.mjs and
  oracle2-compose-candidate.mjs enforce this invariant using real Docker config.
- Oracle2 pulls application images by exact GHCR digest only; each local ARM64
  image must carry the exact published release-source SHA.
- This watcher does not create a GitHub Release or move production-selected.
- No legacy "latest" tags, image building on production, Watchtower or Docker
  Compose down -v.

## First adoption on the existing v0.22.0 production stack

First merge and review the watcher source and targeted regression tests.
On the production host, copy exactly deployment/production/oracle2 from the
reviewed commit to a root-readable private staging directory. The source commit
must be recorded in the Issue checkpoint.

Run as root (example staging folder /root/memoflow-oracle2-watcher):

    bash /root/memoflow-oracle2-watcher/install.sh
    /usr/local/bin/memoflow-oracle2-watch --check-only
    /usr/local/bin/memoflow-oracle2-watch --adopt-current
    /usr/local/bin/memoflow-oracle2-watch --run-once

The installer deliberately leaves the timer DISABLED. First adoption is only
allowed when the previously verified v0.22.0 manual deployment ledger and the
actual live selected release agree. Neither adoption nor a same-release
--run-once may execute Migrator or restart a business container.

Only after confirming the old app/container IDs and DB/Redis/Caddy are
unchanged, the canonical Web/API/PowerSync endpoints have valid HTTPS, and
oracle2-watch-state.json is DEPLOYED, explicitly enable:

    bash /root/memoflow-oracle2-watcher/install.sh --enable
    systemctl status memoflow-oracle2-deploy-watch.timer --no-pager
    systemctl start memoflow-oracle2-deploy-watch.service
    journalctl -u memoflow-oracle2-deploy-watch.service -n 50 --no-pager

Disable the timer without modifying any application or data volumes:

    bash /root/memoflow-oracle2-watcher/install.sh --disable

The unit uses a host flock lock and a 3-minute timer (no duplicate writer).
The systemd service is a one-shot with no additional Caddy dependencies.

## Subsequent selected releases

For an unchanged release, the watcher checks OCI identity, Compose/image
identity, state, container health, Caddy ownership and trusted HTTPS; it exits
NO_CHANGE without component image pulls, DB backup or migrator.

For a strictly newer Published Release with unchanged runtime pins, it:

1. Verify control OCI, Source SHA, exact application digests, ARM64 platform,
   current Compose/service identity, shared Caddy and runtime pins.
2. Render the candidate and deep-compare fully resolved Docker Compose JSON.
   Only API/Web/Migrator image refs and API APP_VERSION may change.
3. Create a **fresh root-only** PostgreSQL logical backup and original
   Compose/env/state copies. Check gzip roundtrip and backup digest.
4. Record APPLYING, stop Web/PowerSync/API, run the exact Migrator, then start
   healthy API, existing PowerSync and new Web in sequence.
5. Verify live container immutable refs and origin HTTPS, check PG/Redis/Caddy
   IDs are unchanged, atomically promote app-only Compose/env, and record DEPLOYED.

If a failure occurs after Migrator starts, the watcher writes BLOCKED with the
backup path, does not blindly restore a possibly incompatible DB schema, and
rejects subsequent automatic retries. Inspect the incident and its backup
before attempting a separately approved recovery.

Root-only authority paths:

- /opt/memoflow-oracle2/compose.yaml
- /opt/memoflow-oracle2/production.env
- /var/lib/memoflow-oracle2-delivery/oracle2-watch-state.json
- /var/lib/memoflow-oracle2-delivery/backups/

The older production-app-only-state.json is the audit record for the manually
deployed v0.22.0 baseline; after timer adoption the watcher state becomes the
canonical record for later releases. Do not erase old receipts or PG volumes.

## Validation

Targeted, no Docker required:

    node --test deployment/production/oracle2/watch-contract.test.mjs
    node --test tools/ci-cd-platform/__tests__/oracle2-compose-candidate.test.mjs
    node --test tools/ci-cd-platform/__tests__/oracle2-topology-preflight.test.mjs

On Oracle2, --check-only uses the real trusted OCI control and live topology.
It does not restart business services, change Cloudflare DNS, or perform
authenticated user CRUD. OAuth login, owner-scoped CRUD, PowerSync subscriber
checkpoints and restart persistence remain independent Issue #543 gates.
