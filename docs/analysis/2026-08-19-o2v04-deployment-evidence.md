# O2V-04 — Oracle2 Deployment Acceptance: Rebuild + Health + MagicDNS Reachability Evidence

> Date: 2026-08-19
> Plan: `docs/plan/active/2026-08-18-oracle2-hermes-local-validation-hardening.md` batch O2V-04
> Host: Oracle2 (`oracle.taile92a8e.ts.net` / tailscale 100.68.237.116)
> Git HEAD at rebuild: `fd19224b38e6e88428b7a50695f9b54e9b209d9c`

## 1. Pre-rebuild audit (2026-08-19)

- MagicDNS DNS resolves: `oracle.taile92a8e.ts.net → 100.68.237.116` ✓
- Current stack was STALE: images 17-19h old (pre ACR-071 / O2V-01). `memoflow-api-1` was
  **Exited(1)** with the exact ACR-071 symptom: "AUTH_BASE_URL / MEMOFLOW_WEB_URL must use HTTPS
  in production" (MagicDNS http rejected without LOCAL_VALIDATION).
- `.env.local` had AUTH_BASE_URL/MEMOFLOW_WEB_URL/POWERSYNC_URL (MagicDNS) but was MISSING
  `LOCAL_VALIDATION=1` → added it (machine file, not committed).
- Cleared stale `dist/generated/prisma` (Prisma build product with foreign UID → copy EPERM) so
  `database:build` could regenerate; `local-compose.mjs build-prep` then succeeded (EXIT=0).
- Cleaned Exited `memoflow-legacy-feature-repository-*` containers.

## 2. Rebuild (`local-compose.mjs rebuild`, from HEAD fd19224b)

- All code images rebuilt: web/api/ai-service/migrator/powersync. Container health:
  - api: **healthy** (was Exited 1) — ACR-071 LOCAL_VALIDATION + MagicDNS now accepted.
  - web: healthy; ai-service: healthy; powersync: healthy; postgres/redis: healthy.
  - migrator: Exited(0) = migration succeeded.
- Ports: web 58080, api 53080, ai 58100, powersync 58081 all 0.0.0.0.
- OCI revision: web/api/ai-service = `fd19224b…` (== Git HEAD; `-dirty` from machine files).
  powersync OCI label `6aab57d2` is the upstream PowerSync service version (Dockerfile
  `FROM journeyapps/powersync-service:latest`), NOT a MemoFlow commit — semantic, not a defect.

## 3. MagicDNS network reachability (from Oracle2 to its own tailscale name)

- `http://oracle.taile92a8e.ts.net:58080` → **HTTP 200**, `<title>知行 MemoFlow</title>` (real web UI).
- `http://oracle.taile92a8e.ts.net:53080/api/auth/get-session` → **HTTP 200** (Better Auth works).
- `/api/auth/error → 302`, `/api/auth/sign-in/email → 404` (Better Auth routes; sign-in path/method).
- These directly verify plan target: "Docker Playwright 使用实际公开 URL，验证用户最终访问的网络路径".

## 4. Status / remaining

- ✅ O2V-04 steps 1-3 done (clean rebuild, all healthy, revision == HEAD, MagicDNS reachable).
- ⏳ Step 6-7 (browser-level MagicDNS register/verify/login product flow + validate-local-deploy)
  still pending — long-running browser acceptance over the public URL.

## 5. Rollback note

- `.env.local` is machine-local (not committed); removing it restores loopback defaults.
- Previous good images remain tagged `:local` history; `-dirty` never used as acceptance evidence
  beyond this reachability checkpoint per plan §5.
