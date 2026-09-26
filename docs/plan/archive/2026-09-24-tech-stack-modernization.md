---
tags:
  - plan
  - archive
  - engineering
  - dependencies
description: 2026-09-24 MemoFlow 技术栈现代化与兼容性升级
created: 2026-09-24T20:16:00+08:00
updated: 2026-09-25T23:30:00+08:00
---

# MemoFlow Tech Stack Modernization — 2026-09-24

## Goal and scope

Upgrade the supported stable engineering stack across Web, Desktop, API, shared packages, and Mobile without changing product behavior. The migration and compatibility repairs are complete; all required local gates passed on 2026-09-25.

## Current version decisions

| Area | Chosen version | Reason |
| --- | --- | --- |
| Node / pnpm | Node 24 / pnpm 11.20.0 | CI and host baseline. |
| Nx family / Vite / Rolldown | 23.2.1 / 8.3.1 / 1.2.9 | Matching Nx family versions; Rolldown pin preserves Web Bundled Dev protocol behavior. |
| Vue / Router / Pinia / persisted state / VueUse | 3.5.43 / 5.3.1 / 4.0.3 / 4.7.1 / 15.0.0 | Current stable Vue stack. |
| Electron / electron-builder | 44.4.5 / 26.16.1 | Current stable desktop stack. |
| Playwright / Prisma | 1.63.0 / 7.10.0 | Prisma 8 is only RC in the current audit; generated client is regenerated. |
| Tailwind CSS / Vite plugin | 4.3.3 / 4.3.3 | Matching stable releases. |
| Better Auth / Mastra core | 1.7.6 / 1.70.0 | Current stable releases; Mastra libsql 1.23.2, memory 1.32.0, pg 1.27.0. |
| PowerSync common / node | 2.3.0 / 1.1.0 | Current stable releases. |
| Axios / ioredis / Nodemailer / Markdown-It / Zod | 1.20.0 / 6.0.0 / 10.0.10 / 15.0.2 / 4.6.5 | Stable direct dependencies. Markdown-It owns its types; removed its DefinitelyTyped package. |
| ESLint / typescript-eslint | 10.11.0 / 8.70.1 | Latest stable; remaining third-party peer declarations are audited below. |
| Vitest / TS native CLI / TS compiler API | 4.1.11 / 7.0.2 / 6.0.2 | Nx peer-compatible Vitest and side-by-side TS transition. |

### Compatibility boundaries

- **TypeScript 7 CLI with TS6 compiler API:** root `@typescript/native` aliases `typescript@7.0.2`, and the `tsc` binary uses this native compiler. Workspace `typescript` aliases `@typescript/typescript6@6.0.2`, retaining the programmatic compiler API required by Vue, vue-tsc, ESLint, and AST tools. `tsc6` remains available. Removed `baseUrl` from all live tsconfigs and made path targets explicit and relative to the defining config. tsup 8.5 internally injects `baseUrl` into its TS6 declaration worker, so only the shared tsup DTS helper supplies TS6's deprecation setting; the TS7 configs do not. Mobile keeps Expo-compatible `typescript~6.0.3`.
- **Vitest 4.1.11:** Nx 23.2.1's published peer range supports Vitest 4, not 5. Keep the matching Vitest UI and V8 coverage packages on 4.1.11 until Nx supports 5.
- **Expo 57:** `expo install --fix` selected React 19.2.3, React Native 0.86.3, and its supported Expo/React Native modules. The newer React 19.3/React Native 0.87 lines are outside this SDK matrix.
- **AI SDK adapter:** `@ai-sdk/openai-compatible-v6` aliases `@ai-sdk/openai-compatible@2.0.62` because this adapter is explicitly on the AI SDK v6 contract. The 3.x line is a separate SDK major migration.
- **dotenv-expand 13.0.0:** 1000.0.0 adds command substitution and encrypted `.env` processing. Preserve the existing environment interpretation for this engineering-only upgrade; evaluate that semantic change separately. [Upstream changelog](https://github.com/dotenvx/dotenv-expand/blob/master/CHANGELOG.md).
- **Node types 24:** match the Node 24 CI/runtime baseline rather than the newer Node 26 type surface.
- **Electron 44 API:** MemoFlow uses browser `navigator.clipboard`, not Electron's removed renderer clipboard APIs. Electron 44 also removed the macOS `openAsHidden` login item field, so the desktop auto-launch adapter no longer passes it; the Windows/Linux `isHidden` option remains. [Electron 44 breaking changes](https://www.electronjs.org/docs/latest/breaking-changes).
- **Calendar type identity:** Reka UI and MemoFlow must resolve the same `@internationalized/date` instance because `CalendarDate` has private fields. The pnpm override pins all consumers to stable 3.12.4.
- **Mobile workspace packages:** `ui-react-native` and `app-react` declare their Expo 57 toolchain imports as development dependencies so each package can typecheck outside the mobile app directory.
- **PowerSync result contract:** PowerSync 2 allows `rowsAffected` to be absent. The Electron database contracts now express that option; CAS checks accept only an explicit expected count, and operations returning a count reject an absent value.
- **Desktop bundling:** Vite 8.3.1's pinned Rolldown 1.2.9 panicked while tree shaking Mastra 1.70's re-exported `SOURCE_CONTROL_AGENTS_DIR`. `treeshake: false` is limited to Electron main; renderer and preload retain their usual settings. Revisit when Rolldown fixes the finalizer bug.
- **Desktop runtime closure:** Scheduler imports the generated Prisma entry instead of the database root at runtime, so Desktop does not initialize the server Prisma singleton. Its local TypeScript alias points to source generated declarations to keep Prisma JSON sentinel types identical. electron-builder hoisted ESM-only `is-stream@4.0.1` into Winston 3's CommonJS lookup path despite Winston's `^2` dependency. Desktop declares `is-stream@2.0.1`, packages it under Winston's own `node_modules`, and verifies the resolved major in the packaged archive.
- **Linux unpacked smoke:** The harness invokes the installed Nx CLI directly inside its isolated `HOME` so pnpm does not attempt a store migration. Only this unpacked `electron-builder --dir` smoke passes `--no-sandbox`: its CI-user-owned `chrome-sandbox` is mode 755, while installed artifacts retain the normal sandbox.
- **Peer metadata:** `@expo/require-utils` and Madge declare TS5 only; eslint-plugin-import/react declare up to ESLint 9; `@vee-validate/zod` declares Zod 3. These are classified by actual lint, typecheck, tests, and builds, not by peer metadata alone.

## Verification record

- [x] Dependency and lockfile refresh; `corepack pnpm install --frozen-lockfile` exited 0 after the last dependency edit. Root manifest identity was checked before and after packaging/install.
- [x] Direct dependency outdated audit completed; remaining stable newer majors are compatibility holds listed above. Prisma 8 is RC, not a stable upgrade target.
- [x] TypeScript 7 `baseUrl` and `paths` migration applied to all live tsconfigs; focused contracts and database compiler checks passed.
- [x] Full `NX_DAEMON=false corepack pnpm nx run-many -t lint,typecheck,test,build --all --parallel=4 --outputStyle=static` exited 0 after the final launcher edits: 41 projects, 150 tasks, 144 cache hits. The first closure pass found three real failures (scheduler Prisma type identity, stale release test assertion, Mobile's global pnpm command); focused reruns and both later full passes are green.
- [x] Prisma `database:prisma-generate`, `database:typecheck`, `database:test`, and `database:build` exited 0; database tests 43/43.
- [x] Desktop typecheck/test/build passed in the full gate. Fresh `desktop:package` via Nx exited 0; packaged verifier found 79 runtime packages, including Winston's nested `is-stream@2.0.1`. Fresh Linux keyring packaged smoke passed 1/1, including renderer, native titlebar, and account settings readiness.
- [x] Web typecheck/test/build passed in the final full gate. After explicit user consent limited to dedicated local `memoflow_test` at `127.0.0.1:5433`, `NX_DAEMON=false corepack pnpm exec playwright test e2e/authentication/auth-page-contract.spec.ts --workers=1` passed 5/5. Bundled Dev startup served the page, client, and generated bundle with HTTP 200.
- [x] Mobile lint/typecheck passed in the full gate; `corepack pnpm exec expo install --check` exited 0 and a fresh `corepack pnpm exec expo export --platform web --output-dir ../../.tmp/modernize/mobile-export-closure` exited 0 with 22 static routes.
- [x] `memoflow:governance-check`, `memoflow:docs-check`, and `git diff --check` exited 0; docs/diff were rerun after the plan update.
- [x] Nx Oxlint/Oxfmt pilot deferred: the plugin remains experimental, so no formatter/linter migration belongs in this dependency upgrade.
- [x] Archive after required gates are green.

### Consolidated diagnostic findings

The first uncached Nx run surfaced TS5102 (`baseUrl` removed) and then TS5090 (path targets need explicit relative prefixes). Both compiler config blockers were migrated centrally. It also exposed a time package test pinning the previous `@internationalized/date` version and contracts inventory tests that recursively scanned generated/hidden repository directories under load; both tests were updated to keep their intended checks. A subsequent cached Nx run is the main closure gate; focused reruns are used only for its concrete failures.

### Remaining warnings and holds

`corepack pnpm peers check` reports five existing third-party peer declarations: `@expo/require-utils` and Madge request TypeScript 5, eslint-plugin-import and eslint-plugin-react request at most ESLint 9, and `@vee-validate/zod` requests Zod 3. The corresponding lint/typecheck/test/build and Expo checks pass. Build logs also contain `NO_COLOR`/`FORCE_COLOR`, Vite chunk-size, and native config-loader advisory warnings; none failed a gate. Vitest 5, React Native 0.87, the next dotenv-expand semantic major, and the AI SDK adapter major remain compatibility holds listed above.
