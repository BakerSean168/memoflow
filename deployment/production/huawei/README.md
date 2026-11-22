# Huawei MemoFlow production app-only release

The live host is Debian 12 x86_64 at `/opt/memoflow/runtime` (Compose project
`memoflow`). Unlike retired Oracle2, **Caddy, PostgreSQL, Redis, PowerSync,
and persistent volumes all belong to this one Compose project**. The existing
runtime was installed from the same immutable GHCR image bytes that the legacy
`memoflow-local/*` tags reference. Do not install Oracle2 or historical Alibaba
watchers, run `docker compose down`, replace the data volume, or rebuild images
on the production host.

Production changes require a Published GitHub release and a validated
`Deploy Production(tag)` workflow selection. `production-selected` is the only
mutable selector, and all selected components have immutable OCI digests.
`huawei/deploy.sh` and its structural validator are embedded in the selected
control OCI image by `Dockerfile.runtime`.

## Release

1. Merge the change to `main` and require exact-SHA green `CI Check` and
   canonical `ci-build-artifacts`. Publish a verified Nightly via
   `Nightly Release` (`dry_run=false`); only an **explicit user-requested**
   urgent production release may set `allow_early=true`, which bypasses the
   six-hour cadence only. All release acceptance and Windows/macOS/Linux
   packaging checks still apply. Never publish a failed Draft.
2. Run `Deploy Production` with **that exact Published tag**. Wait for its
   production environment approval and digest/signature/provenance checks to
   finish. GitHub selection does not itself change any live container.
3. On the authorized Huawei host, use the existing pinned production SSH
   host key. Run as root (there is no separate deployment agent on the host):

   ```bash
   docker pull ghcr.io/bakersean168/memoflow-production-runtime:production-selected
   cid="$(docker create ghcr.io/bakersean168/memoflow-production-runtime:production-selected /bin/true)"
   mkdir -p -m 0700 /root/memoflow-selected
   docker cp "$cid:/runtime/production/." /root/memoflow-selected/
   docker rm "$cid"
   bash /root/memoflow-selected/huawei/deploy.sh --check-only
   bash /root/memoflow-selected/huawei/deploy.sh --apply
   ```

   The executor separately checks the OCI control's embedded
   production-set/v1 bytes, exact selected app SHA and amd64 digests, unchanged
   runtime pins, the inspected first-adoption SHA/version, live container identities, and normalized Compose diff.
   The only allowed change is API/Web/Migrator image references, API version,
   and the new default-off `EAG_OAUTH_WRITE_ENABLED` environment key. It
   creates a root-only PostgreSQL logical dump with gzip+SHA256 before stopping
   API/Web, then executes the one-shot Migrator, starts only API/Web and tests
   all three trusted HTTPS origins. Caddy, Redis, PostgreSQL and PowerSync
   container IDs must be unchanged.
4. `HUAWEI_DEPLOY=PASS` and `deploy-state=status=DEPLOYED` are mandatory.
   A failure after starting migrator writes `BLOCKED` with the backup path; do
   **not** blindly roll back images across a possibly changed DB schema.
   A pre-migration failure attempts to restart the old app and records
   `PRE_MIGRATION_FAILED`. The executor is intentionally **not scheduled**;
   no unattended producer or duplicate writer is introduced.

## OAuth activation after a successful release

1. `bash /root/memoflow-selected/huawei/enable-oauth.sh --read-only`. It
   validates the existing private Gateway/host settings, backs up the
   `.env.production.local` to a root-only folder, enables strict CIMD OAuth,
   restarts **only** the API, and checks the resource/issuer discovery JSON
   as well as `WWW-Authenticate` on an unauthorized `/mcp` call. This cannot
   be replaced by an HTTP 200 check on the SPA.
2. `bash /root/memoflow-selected/huawei/enable-oauth.sh --read-write` once the
   read flow is healthy. OAuth write tools remain restricted to explicitly
   consented `goals:write` / `tasks:write`; API/owner transactions and token
   revocation are unchanged. No direct public unauthenticated mutation.
3. Add `https://memoflowapi.bakersean.top/mcp` as a custom MCP connector in
   ChatGPT Web (workspace feature access required), complete the **human OAuth
   consent** using the real account, and confirm the exact ChatGPT CIMD and
   its signed `private_key_jwt` token exchange. Test read before writing one
   disposable Goal + TaskPlan; inspect durable receipts, Get responses and
   Windows Desktop PowerSync, then clean test records.
4. Keep Issue #1060 open until both ChatGPT UI OAuth and Desktop real
   end-to-end verification are proved. A healthy server does not prove that a
   ChatGPT workspace can install/customize this connector.

### Public discovery locations

- OAuth issuer metadata: `https://memoflow.bakersean.top/.well-known/oauth-authorization-server/api/auth` (Web Nginx must proxy to API; SPA HTML is invalid).
- OAuth protected resource: `https://memoflowapi.bakersean.top/.well-known/oauth-protected-resource/mcp`.
- MCP JSON-RPC: `https://memoflowapi.bakersean.top/mcp`, returns unauthenticated 401 with `WWW-Authenticate` pointing to protected-resource metadata.

Read-only inspections can run without stopping services. Never emit the
production environment file, session cookies, private keys, or OAuth tokens
in logs, PRs or issue comments.
