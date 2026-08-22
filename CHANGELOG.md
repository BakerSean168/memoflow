# Changelog

## [0.10.0](https://github.com/BakerSean168/memoflow/compare/v0.9.0...v0.10.0) (2026-08-22)


### Features

* **account:** W3 account closure lifecycle with durable saga, auth deny, desktop fail-closed gate (review-approved, 10 rounds) ([622e8e8](https://github.com/BakerSean168/memoflow/commit/622e8e874a5d30e3cf0722ab65b7c98516da1a76))
* **acr-071:** allow Tailscale MagicDNS http hosts under LOCAL_VALIDATION ([#243](https://github.com/BakerSean168/memoflow/issues/243)) ([2e6ee8f](https://github.com/BakerSean168/memoflow/commit/2e6ee8f18b45f0be081942ac75f38f1528566d6f))
* **ai:** assistant dispatch SSE contract + route hardening (agent-host Step A) ([8a0c4cd](https://github.com/BakerSean168/memoflow/commit/8a0c4cdd4878d4c4016b2a4dc885b7ac5210cb86))
* **ai:** nightly N1 — run.started conversationId + hygiene plan ([105d66c](https://github.com/BakerSean168/memoflow/commit/105d66c739fc30d8dc71cfaf6b333de88dac124b))
* **ai:** nightly N2–N3 — association surface + stale approve gate ([1fd61cc](https://github.com/BakerSean168/memoflow/commit/1fd61cc27cfc245f9e9f3b04b66b9bfb4c949fd7))
* **ai:** Prisma ingredient seam + checkpoint application seam (API AI Step A) ([3615a26](https://github.com/BakerSean168/memoflow/commit/3615a267a0299fb0719a6a65daf6a8a39f7d1d03))
* **ai:** residual 1342 — multi-engine Host web e2e; vault DoD 15/15 ([2444ec9](https://github.com/BakerSean168/memoflow/commit/2444ec9222e41a477b8d9b63b18af0d6ba2dbbbb))
* **ai:** transport-only API module + composeAI host cutover (API AI Step B) ([179188a](https://github.com/BakerSean168/memoflow/commit/179188ab9127716fc8148063172f8d8213d61652))
* **ai:** Vue thin entry + default dispatch with restricted fallback (agent-host Step C+D) ([65c1bf0](https://github.com/BakerSean168/memoflow/commit/65c1bf03adbb92b1551a1203622dc420ebefee0d))
* **ai:** Vue thin entry + default dispatch with restricted fallback (agent-host Step C+D) ([bd3c82d](https://github.com/BakerSean168/memoflow/commit/bd3c82d2dc2fbc6e46d440e44cb2310523f9cbae))
* **ai:** Web SSE + Desktop IPC dispatch stream hardening (agent-host Step B) ([c8a7653](https://github.com/BakerSean168/memoflow/commit/c8a7653080087a44e9a22ac2c1e0445d9dc4c528))
* **ai:** Web SSE + Desktop IPC dispatch stream hardening (agent-host Step B) ([6343b8a](https://github.com/BakerSean168/memoflow/commit/6343b8ae23728f04a4365864d21a5321019a8177))
* **api:** observability + assembly governance — logger/trace/module-handle contracts (refarch phase6) ([c176efa](https://github.com/BakerSean168/memoflow/commit/c176efa356729acf1e7e5f59b628c388e01db12b))
* **api:** observability + assembly governance (refarch phase6) ([cdb272f](https://github.com/BakerSean168/memoflow/commit/cdb272f8edaae49e518e8e2953f3be982441f1e7))
* **api:** unified Request/Execution Context (refarch phase2) ([910efe7](https://github.com/BakerSean168/memoflow/commit/910efe7327f1730e87c649fba052a571f4f05add))
* **api:** unified Request/Execution Context (refarch phase2) ([ca4fe11](https://github.com/BakerSean168/memoflow/commit/ca4fe118456309ceedf6c51eafff4d92fca30cf9))
* **app-vue:** Query Cache authority pilot (refarch phase5) ([f484003](https://github.com/BakerSean168/memoflow/commit/f4840035022083439895b293786a34fe5b464da8))
* **app-vue:** Query Cache authority pilot (refarch phase5) ([8792288](https://github.com/BakerSean168/memoflow/commit/879228847a25724b8016c817fd57125fd480bae8))
* **auth:** transactional email + archive completed plans ([#193](https://github.com/BakerSean168/memoflow/issues/193)) ([f9d76d5](https://github.com/BakerSean168/memoflow/commit/f9d76d5ee73f4b118fac47923fbff9f513177dd8))
* **business:** W0–W7 基础业务模块闭环 — 契约冻结到发布门禁（review-approved） ([#214](https://github.com/BakerSean168/memoflow/issues/214)) ([32b5dc8](https://github.com/BakerSean168/memoflow/commit/32b5dc85a150548c8dc41bdaf38f6d1dec6a96c3))
* **ci-cd:** operational evidence baseline — 7 comparable runs, DoD perf items unmet ([dfc1d0c](https://github.com/BakerSean168/memoflow/commit/dfc1d0cc1ae95920e9a8d61bc8cb6d03473369cf))
* **ci-cd:** operational evidence baseline (7 comparable runs) ([8258d41](https://github.com/BakerSean168/memoflow/commit/8258d415e93afb9bb79e161f4f13d0bcdc8a3519))
* **contracts:** add typed failure foundation ([#232](https://github.com/BakerSean168/memoflow/issues/232)) ([39cb7f5](https://github.com/BakerSean168/memoflow/commit/39cb7f590c88c1ba5728279f5a8f7d0ce2a9bdc7))
* **contracts:** W0 reliable-messaging contracts freeze (review-approved) ([6962dd8](https://github.com/BakerSean168/memoflow/commit/6962dd8fb61097bc39feda9ccbc97cd941050184))
* **docker:local:** allow machine override of AUTH_BASE_URL/MEMOFLOW_WEB_URL (Tailscale origin) ([#230](https://github.com/BakerSean168/memoflow/issues/230)) ([1dde32e](https://github.com/BakerSean168/memoflow/commit/1dde32e558afebb64b0b1dce1da222e970a2ca27))
* **goal,task:** W4 goal/task boundary with durable receipts, atomic transactions, fail-closed composition (review-approved, 6 rounds) ([eeed516](https://github.com/BakerSean168/memoflow/commit/eeed516ea330cdf7e18648950b5166ac76daa1da))
* **governance:** fail-closed Application/Domain forbidden @memoflow/database rule (refarch phase1 step4) ([5d6aa63](https://github.com/BakerSean168/memoflow/commit/5d6aa6392b907232a840d975b809db07976b86c6))
* **notification:** W2 notification dispatch with durable outbox/SSE/desktop worker (review-approved, 13 rounds) ([b76ca53](https://github.com/BakerSean168/memoflow/commit/b76ca534d12c786edd7e24b2cdbd67806f6f9809))
* Obsidian vault repository optimization — DoD 15/15 ([39e73d2](https://github.com/BakerSean168/memoflow/commit/39e73d2cd1f3227d453dd3fe95d4c1068f0465b0))
* **operations:** W7 unified operation timeline, metrics, cross-module fault matrix and release gates (review-approved, 4 rounds) ([52d1986](https://github.com/BakerSean168/memoflow/commit/52d198684983caa470eb4f4ec865ee423cd0b38b))
* **reminder:** W1 scheduler reliability with lease/occurrence/outbox (review-approved) ([96abdda](https://github.com/BakerSean168/memoflow/commit/96abddacc10512410b51e977f70f546bc288b595))
* **repository,setting,auth:** W6 knowledge projection binding, settings defaults/reset, auth error persistence with UI/desktop closure (review-approved, 4 rounds) ([53899b4](https://github.com/BakerSean168/memoflow/commit/53899b47b0e4211c3de4895375639ab825ed2872))
* **schedule:** W5 schedule concurrency with at-least-once durable delivery, conflict projection, idempotent consumption and crash recovery (review-approved, 13 rounds) ([fcdd25a](https://github.com/BakerSean168/memoflow/commit/fcdd25a23185ba60adf1c213c06a89c12403b5a5))
* **time:** ADR-037 product time system (P1–P11) ([#192](https://github.com/BakerSean168/memoflow/issues/192)) ([d7f1157](https://github.com/BakerSean168/memoflow/commit/d7f1157be544d0b73618de9491f4f4a3ce7aeaee))
* **ui+business:** UI 结构优化与业务闭环重构 R2–R7 ([#211](https://github.com/BakerSean168/memoflow/issues/211)) ([b054068](https://github.com/BakerSean168/memoflow/commit/b054068847437f74ffdf8591d2f0038f09edd0c1))
* **web:** add Better Auth device approval flow ([56391c7](https://github.com/BakerSean168/memoflow/commit/56391c7e7c0f181265f5434a4ca1231c542e1b58))
* **web:** residual 1339 — real OAuth e2e harness; still 12/15 ([bef3125](https://github.com/BakerSean168/memoflow/commit/bef31255d4cae3aab310dc54b7d4241498fe403b))
* **web:** residual 1340 — real GitHub OAuth e2e green; flip entry DoD ([fc42622](https://github.com/BakerSean168/memoflow/commit/fc426224d52b7e75551a1a929cf44f7ec7a1af37))


### Bug Fixes

* **acr-049:** address GPT-5.6 second-review findings on [#234](https://github.com/BakerSean168/memoflow/issues/234)/235/236/237/243 ([#245](https://github.com/BakerSean168/memoflow/issues/245)) ([7b824cf](https://github.com/BakerSean168/memoflow/commit/7b824cf584e4c1819b739271326bea0b914410a0))
* **acr-049:** address GPT-5.6 secondary-review regressions ([#244](https://github.com/BakerSean168/memoflow/issues/244)) ([c934d13](https://github.com/BakerSean168/memoflow/commit/c934d135622b48a0a07be49ed00def5c8a6e5f49))
* **ai:** restore merge-base closure predicate for AI executor; harden governance matcher (refarch review R1) ([9742a64](https://github.com/BakerSean168/memoflow/commit/9742a64b750765d360dffca8a436102d19f59f3c))
* **ai:** review R1 — partial-start cleanup + JSDoc/docs fixes (P1x1, P2x5) ([540ae2f](https://github.com/BakerSean168/memoflow/commit/540ae2fa1a8e5338522f1b04a48e796e2be84ee7))
* **api:** adapt task-goal-host-restart integration test to instance-bound task module ([aa7a37f](https://github.com/BakerSean168/memoflow/commit/aa7a37ffefd55dc5e7c8e316a4e65077d9706ee8))
* **api:** E5b replace bootstrap LegacyAccountModule docs with AccountApiModule ([#190](https://github.com/BakerSean168/memoflow/issues/190)) ([024d5dc](https://github.com/BakerSean168/memoflow/commit/024d5dc995820a3d49e160e372358c3461f0f51f))
* **api:** force e2e-mock OAuth on RUNTIME_LANE=e2e ([feb94a8](https://github.com/BakerSean168/memoflow/commit/feb94a8065d47417cfa7f9bf0feb4348cb3ff599))
* **api:** openapi generator.spec.ts typecheck errors (hasBody/params/cast) (refarch phase4 CI fix) ([8ed9931](https://github.com/BakerSean168/memoflow/commit/8ed99319082c6b8243072d7356ccfe3b1cba0ccb))
* **api:** remove unused operations metric imports + unused test var (lint gate) ([e196e0a](https://github.com/BakerSean168/memoflow/commit/e196e0ab39263c7d01485d905852ccfbfe6334aa))
* **api:** review R1 — correlation requestId to Python, forbidden-inventory casing (refarch phase2) ([5fcacac](https://github.com/BakerSean168/memoflow/commit/5fcacac6c65c41a59681dc41dd07f3c68c0dc4de))
* **api:** review R2 — runId fallback removed, real detector mutation tests (refarch phase2) ([27d8fab](https://github.com/BakerSean168/memoflow/commit/27d8fab207b23c8de2fac9e647c3e3170b6530f0))
* **api:** review R3 — notification SSE identity-scoped, goal context canonical (refarch phase2) ([48eaa63](https://github.com/BakerSean168/memoflow/commit/48eaa6351ca21b1cda8372fd2fd991a188f602ae))
* **api:** review R4 — tsconfig spec minimal-exception (refarch phase2) ([56e9512](https://github.com/BakerSean168/memoflow/commit/56e951249c65f51ec75b7e259591ef5da2e691b0))
* **api:** update residual surface specs to server.ts composition entry (refarch phase6 CI fix) ([58b0d15](https://github.com/BakerSean168/memoflow/commit/58b0d152c5d232af6e6091b6c03cd61f4e36cb1a))
* **app-react:** pass expectedVersion in schedule editor update/delete (W5 contract after main merge) + regenerate inventory ([8b5445d](https://github.com/BakerSean168/memoflow/commit/8b5445d7d0863fd0651100b44acf8f66a1831b6c))
* **app-vue:** review R1 — governance pilot + mutation identity/rollback + evidence closure (refarch phase5) ([a3bc777](https://github.com/BakerSean168/memoflow/commit/a3bc777dfa1effd87aefc4e38f181d10ce2117bd))
* **app-vue:** review R2 residual P2s — governance stale window, task error facade, desktop lifecycle (refarch phase5) ([94b5e2d](https://github.com/BakerSean168/memoflow/commit/94b5e2df438da0113eca02e108b832cd9dc9dc60))
* **app-vue:** review R3 — per-invocation identity scope for batch-delete (refarch phase5) ([48d2f27](https://github.com/BakerSean168/memoflow/commit/48d2f27aa88e7b36404cffd58ac3eaaaa0ab6a44))
* **auth:** preserve Better Auth sign-in outcomes + full auth flow test matrix ([#229](https://github.com/BakerSean168/memoflow/issues/229)) ([def2b2c](https://github.com/BakerSean168/memoflow/commit/def2b2cd88c73c880f9f2c2fcf55c109a8728103))
* **batch:** review R1 — regressions + seams (P1x6, P2x6) ([fbe2d76](https://github.com/BakerSean168/memoflow/commit/fbe2d76ef005c66b674137dbe4ff65319b98e705))
* **batch:** review R2 — partial-start cleanup x6 + guard hardening (P1x2, P2x2) ([865f5ac](https://github.com/BakerSean168/memoflow/commit/865f5acadfa478c2e47a646b229fe08dbd824a9e))
* **build:** prod-like infra — Dockerfile.api copy normalize script, web app-vue subpath alias, contracts reliable-messaging build entry ([c016da7](https://github.com/BakerSean168/memoflow/commit/c016da718359ffe2d49adc1182bae78c7a47fa9c))
* **ci-cd:** skip skipped jobs in run metrics (docs-only Delivery Observation) ([b9f457f](https://github.com/BakerSean168/memoflow/commit/b9f457fd7ba3e603d8fbd9596d0d1696fb37f796))
* **ci-cd:** skip skipped jobs in run metrics (docs-only Delivery Observation) ([7367daf](https://github.com/BakerSean168/memoflow/commit/7367dafc41c6ee4a8590c170dad81b6940ddcc90))
* **contracts:** remove dead ServerModuleContext&lt;DbClient&gt;, stale docs, lazy OTel import (refarch phase6 review P2) ([f64c8e2](https://github.com/BakerSean168/memoflow/commit/f64c8e25c097538ea97c8c55b667954077dacfef))
* **contracts:** remove unused rpc-map imports (refarch phase4 CI fix) ([1813327](https://github.com/BakerSean168/memoflow/commit/181332795cf7d14e9b680f1f5991dd3ec388b8dd))
* **contracts:** runtime textual pins for rpc-map tuples (refarch phase4 review R2) ([936b17e](https://github.com/BakerSean168/memoflow/commit/936b17edf5517c3b3a4b03012bdb57b21cca51d3))
* **dashboard:** reconcile task goal progress ([b9043c7](https://github.com/BakerSean168/memoflow/commit/b9043c78989f46ff582212aec31410791ef9cd0f))
* **desktop-e2e:** residual 1333 Linux guest safeStorage for headless CI ([53b17e5](https://github.com/BakerSean168/memoflow/commit/53b17e5fff197e802e1a6d56d709019be27f542b))
* **desktop:** add @memoflow/data-portability bare alias to ipc/main vitest configs ([fdf8cae](https://github.com/BakerSean168/memoflow/commit/fdf8cae1184b0cd16c42389ee6dae9b7d35780df))
* **desktop:** ipc/main vitest configs use createSharedConfig for full src aliases ([e81cf53](https://github.com/BakerSean168/memoflow/commit/e81cf53bcab32f58a22474fef57866359ec6cfc5))
* **docker:** copy tools/mcp into API image for root postinstall ([140ce02](https://github.com/BakerSean168/memoflow/commit/140ce022a11e6eba25e0313d526036fc3dc79ce7))
* **docker:** powersync config baked into image — workaround for Docker 29.6.2 file-bind regression (prod-like verification) ([2c7d7c3](https://github.com/BakerSean168/memoflow/commit/2c7d7c3b510928a9b499667fc97e2e2bdf749943))
* **e2e:** align web flows with current contracts ([caa04bd](https://github.com/BakerSean168/memoflow/commit/caa04bd627dde2b0ae7d1bba77a565486177f2a4))
* **e2e:** assert W6 password-mutation receipt banner on token replay (stale pre-W6 selector) ([de32350](https://github.com/BakerSean168/memoflow/commit/de32350c692f4a549e3baebe6f805f2123c49d90))
* **e2e:** enable Better Auth email link capture ([e4ddbce](https://github.com/BakerSean168/memoflow/commit/e4ddbceb7a7299428816396c3b92faa03d6ce5b6))
* **e2e:** enforce validation in API process ([bf40920](https://github.com/BakerSean168/memoflow/commit/bf40920731ca598e81591d801d30c2f777aa4221))
* **e2e:** residual 1333 goal-workflow Host SSE and App wire notes ([cddbd74](https://github.com/BakerSean168/memoflow/commit/cddbd746c3dec353a425830bfbe5131791cc6f9d))
* **gates:** residual 1328 lint/typecheck blocker reduction ([45a8105](https://github.com/BakerSean168/memoflow/commit/45a81050a59847724cea10b3b501ff8f331704e9))
* **gates:** residual 1329 workspace lint closure ([fdcb1d6](https://github.com/BakerSean168/memoflow/commit/fdcb1d636a6f7cb2a8c84afadf9341e896e929f4))
* **gates:** residual 1330 workspace typecheck blocker reduction ([32f575f](https://github.com/BakerSean168/memoflow/commit/32f575f2094175da672755aadf068c16001ad62a))
* **gates:** residual 1331 desktop harness low-risk closure ([fe17474](https://github.com/BakerSean168/memoflow/commit/fe1747412e9c8b2d213ad1daf16ebd281d7335a5))
* **gates:** residual 1331 workspace test blocker reduction ([bbb269f](https://github.com/BakerSean168/memoflow/commit/bbb269f8e83adff7ba7ffeefa8a2d5bca57650e8))
* **gates:** residual 1332 full workspace standard test green ([3393ba3](https://github.com/BakerSean168/memoflow/commit/3393ba356ce7c35bb67dad4a1c1a0c1d038db8ee))
* **goal,task:** review R1 — route rollback, partial-start, barrels (P1x4, P2x6) ([73153d1](https://github.com/BakerSean168/memoflow/commit/73153d10c9da8fc46597ba8d6308882754d893f0))
* **goal,task:** review R2 residuals — destroy-after-failed, teardown order, mount rollback (P2x3) ([fee031f](https://github.com/BakerSean168/memoflow/commit/fee031f7430ad8d0a48e25e94d2fd86a010435e3))
* **goal:** adapt integration test to instance-bound goal module ([b7c07d9](https://github.com/BakerSean168/memoflow/commit/b7c07d9476a6180ab76ec03b135109fe43e8391e))
* **goal:** normalize delete version queries ([83b635b](https://github.com/BakerSean168/memoflow/commit/83b635b839c60fdc60a150a077110b108d485f69))
* **governance:** cover @memoflow/database subpaths + align README (refarch review R2) ([7647cb2](https://github.com/BakerSean168/memoflow/commit/7647cb27d1a7c99e89b4345be0072a7a0458834e))
* **governance:** forbid @prisma/client in Application/Domain (refarch review R3) ([6811cd2](https://github.com/BakerSean168/memoflow/commit/6811cd2d8d4b05ff64d10b7048f887928ee8ed26))
* **governance:** review R1 — handle state machine, IPC cleanup, docs (P1×3, P2×4) ([5d7903e](https://github.com/BakerSean168/memoflow/commit/5d7903ef7bf56b0fb802b026e1481fd11015a298))
* **governance:** review R2 residuals — reverse handler removal + ADR-031 (2 items) ([74e6e54](https://github.com/BakerSean168/memoflow/commit/74e6e5439b0e6cf8346d27664a7e47b29db8e166))
* **local-validation:** harden MagicDNS and scheduler takeover ([#233](https://github.com/BakerSean168/memoflow/issues/233)) ([4a0e495](https://github.com/BakerSean168/memoflow/commit/4a0e495188a1b7ba06643093ee6a95e050652dcd))
* **notification:** scoped imports + cleanup in SSE integration test (refarch phase2 CI fix) ([12f7389](https://github.com/BakerSean168/memoflow/commit/12f7389e4fb484bdf506738287b3c1351d125619))
* **o2v01:** auto-include MEMOFLOW_WEB_URL origin in API trustedOrigins/CORS and AI allowlist ([#247](https://github.com/BakerSean168/memoflow/issues/247)) ([fd19224](https://github.com/BakerSean168/memoflow/commit/fd19224b38e6e88428b7a50695f9b54e9b209d9c))
* **powersync:** remove phantom table queries and mappings (documents/goal_statistics/schedule_jobs) ([f97c9c5](https://github.com/BakerSean168/memoflow/commit/f97c9c5cfa52519c8a2e49b8e9367ac4e9de4911))
* **powersync:** remove phantom table queries and mappings (documents/goal_statistics/schedule_jobs) ([026c1a9](https://github.com/BakerSean168/memoflow/commit/026c1a98695226d4fb4e74b0c4c6617ff4688aa2))
* **repository:** derive App push from contents:write; live-github green ([7d0cd3f](https://github.com/BakerSean168/memoflow/commit/7d0cd3ffd7dba5938ed22b5214d4202e611ef934))
* **test:** api metrics surface slice window + ai abort signal behavioral assertion (CI gates) ([58d9735](https://github.com/BakerSean168/memoflow/commit/58d9735049f9c98cfdbb4c8c938f293088745be2))
* **test:** repair clean integration resolution ([#201](https://github.com/BakerSean168/memoflow/issues/201)) ([e925ddf](https://github.com/BakerSean168/memoflow/commit/e925ddfc75e806b961f84ffbf55e04ce4872b8ad))
* **test:** resolve time sources in domain suites ([#200](https://github.com/BakerSean168/memoflow/issues/200)) ([071732d](https://github.com/BakerSean168/memoflow/commit/071732d10181cf6d546ad1f8427c7a74351543d5))
* **test:** run account integration serially (fileParallelism:false) — shared-DB timing flake ([1de7a1d](https://github.com/BakerSean168/memoflow/commit/1de7a1d6fea9b4521bec5db7338d4eaebf160577))
* **test:** widen dual-coordinator lease window to remove CI timing flake ([e5530f4](https://github.com/BakerSean168/memoflow/commit/e5530f42cd114bf653aa6700cf857eefda1a9970))
* **transport:** review R1 — full validation migration, production parity, rpc-map types, OpenAPI closure (refarch phase4) ([9905023](https://github.com/BakerSean168/memoflow/commit/9905023f2abbd09d3c40816b225f528a79b74c92))
* **ui:** polish shell focus interactions ([#251](https://github.com/BakerSean168/memoflow/issues/251)) ([93a69d7](https://github.com/BakerSean168/memoflow/commit/93a69d7c912cbdfe9f96024ee41ff9c2c26e2d3d))
* **utils:** express-adapter lenient fallback when request-context middleware not mounted (refarch phase2 CI fix) ([1b0f168](https://github.com/BakerSean168/memoflow/commit/1b0f168b3e06a2494ccfc6c2bb2ed482b1a98387))
* **vitest:** add cloud-auth to commonWorkspacePackages aliases (integration resolution) ([a14957e](https://github.com/BakerSean168/memoflow/commit/a14957efef63fb84c17a816c3889ece0a3433334))
* **vitest:** add data-portability to commonWorkspacePackages aliases ([bdef1b1](https://github.com/BakerSean168/memoflow/commit/bdef1b129bc78964dfe69fb58f6f8bf3915588cf))
* **vitest:** add powersync-schema to commonWorkspacePackages aliases (CI clean-checkout resolution) ([ac4e618](https://github.com/BakerSean168/memoflow/commit/ac4e6185894818c869e51e9a187d9df2279a71d2))
* **web/auth:** add zh-CN + en auth i18n keys for name field and GitHub login ([#249](https://github.com/BakerSean168/memoflow/issues/249)) ([691bb08](https://github.com/BakerSean168/memoflow/commit/691bb08ec912840dbc35ceaa2a11b69852fdb214))
* **web:** close core business e2e residuals; keep App install external ([edf1c69](https://github.com/BakerSean168/memoflow/commit/edf1c695927ab0f6bcce6fa3037514b1b2ab6904))
* **web:** proxy Better Auth requests in E2E ([0b4f5d3](https://github.com/BakerSean168/memoflow/commit/0b4f5d30134071a641a7027cad78021436cfc5cf))
* **web:** residual 1335 — skip interactive OAuth; e2e LOG_DIR + prod-like API ([78822a4](https://github.com/BakerSean168/memoflow/commit/78822a4afce7358a617e2213d1b42840d75b3e50))
* **web:** residual 1335 — wait for app-shell after auth in e2e ([e38a338](https://github.com/BakerSean168/memoflow/commit/e38a3386ea49e732a706b67e762599a13340d697))
* **web:** residual 1337 — remote shell/desktop/ai-workspace/sync e2e green ([2db2295](https://github.com/BakerSean168/memoflow/commit/2db22956da7a3eae0c38708cbb82b75e506e7e39))


### Performance Improvements

* **ci:** avoid redundant browser dependencies ([47bd84d](https://github.com/BakerSean168/memoflow/commit/47bd84d84b3f2c4fb22fff8205605fcebcaf7807))
* **ci:** shorten web validation feedback ([cf6c2bf](https://github.com/BakerSean168/memoflow/commit/cf6c2bf74a3518a33b271ad0c502fc267bb80f56))
* **ci:** shorten web validation feedback ([0b1a060](https://github.com/BakerSean168/memoflow/commit/0b1a060023daf10065c55a18b26fdb3bcd49667b))

## [0.9.0](https://github.com/BakerSean168/memoflow/compare/v0.8.0...v0.9.0) (2026-06-08)


### Features

* Add AI Agent system architecture and workflow plans ([0115b45](https://github.com/BakerSean168/memoflow/commit/0115b45ce3f4a6b67c6b19efa9fca1960ddac064))
* **contracts:** add data portability contract module ([1096bbd](https://github.com/BakerSean168/memoflow/commit/1096bbd81ccc0cc96fb007cabdef0d1b4026a3cf))
* **data-portability:** add core package with use-cases, importers, projections, and tests ([640cff8](https://github.com/BakerSean168/memoflow/commit/640cff808a336b0de0c47a8e04ca326c2bc99fc9))
* **data-portability:** add DataPortabilityChannels to shared IPC contracts ([6f16ad8](https://github.com/BakerSean168/memoflow/commit/6f16ad8c6fb2feea93cd71143f1d459b8bc8adfc))
* **data-portability:** wire up platform DI, API module, and UI integration ([6c58539](https://github.com/BakerSean168/memoflow/commit/6c58539bf81a11cb00cb70aedadeb9e0163853e9))

## [0.8.0](https://github.com/BakerSean168/memoflow/compare/v0.7.0...v0.8.0) (2026-06-02)


### Features

* **api:** add powersync profile snapshot pipeline ([e0375de](https://github.com/BakerSean168/memoflow/commit/e0375de160df6bc95cca3d193f0f3ae6ff3780d2))
* **desktop:** add shared user files settings flow ([9b51e52](https://github.com/BakerSean168/memoflow/commit/9b51e523a5afc3b546edc637ce27b822f26177c4))
* **setting:** implement file picker for importing settings in UserSettingsView ([ca42567](https://github.com/BakerSean168/memoflow/commit/ca42567283689d20c7e819ff1db5cb23e096432d))


### Bug Fixes

* **ai:** use workspace database export ([3c81441](https://github.com/BakerSean168/memoflow/commit/3c814419af2ef0bfa0ab364befd276fde1f75786))
* **nx:** address code review findings for target governance ([4ff3830](https://github.com/BakerSean168/memoflow/commit/4ff3830830a2da0d466ef21225b78c60752eae3f))
* **test:** restore AIChatView goal workflow test rendering ([bef8d46](https://github.com/BakerSean168/memoflow/commit/bef8d467b6b4d02db04bc0e3ab8340f2464f3def))
* **web:** add eslint-disable for governance mock boundary import ([8d14846](https://github.com/BakerSean168/memoflow/commit/8d1484600b5fc525084ac3d855e3f60bd24996d2))
* 修复desktop 的 Vite dev alias 配置错误 ([62d4dc1](https://github.com/BakerSean168/memoflow/commit/62d4dc15be26a8e48ff4fe6d52829060b4d36794))


### Performance Improvements

* 修改文件名 ([92f41cb](https://github.com/BakerSean168/memoflow/commit/92f41cb52e91441cd65c1ac3b72837ee04b825b3))
* 修正 desktop 开发模式热更新失效与启动前全量依赖构建的问题 ([e1cc94b](https://github.com/BakerSean168/memoflow/commit/e1cc94b77898382df58eff7d450a4141a4755ed7))
* 登录界面样式优化 ([6cb065e](https://github.com/BakerSean168/memoflow/commit/6cb065ea688d05a4db6ab95335cefe66b217a3f1))

## [0.7.0](https://github.com/BakerSean168/memoflow/compare/v0.6.0...v0.7.0) (2026-05-15)


### Features

* add desktop screenshot E2E tests and configuration ([678eda2](https://github.com/BakerSean168/memoflow/commit/678eda254cea153d88672b6b9fc0b8191457341d))
* add notification-runtime package and refactor notification initialization tasks ([09bc0b2](https://github.com/BakerSean168/memoflow/commit/09bc0b2972a0a6ea16fadcbe277b45c307b63001))
* consolidate CI workflows and enhance coverage detection; add optional Python/uv setup ([fa5ba9c](https://github.com/BakerSean168/memoflow/commit/fa5ba9cfd69323550556980861f02f6b22fd3176))
* implement web:typecheck failure chain fix plan ([459daf6](https://github.com/BakerSean168/memoflow/commit/459daf60947386407c8fd2c6f4a8bc8a3b8c0573))
* **schedule:** 简易日程冲突检测功能，添加日程时，如果有冲突，能实现！标记 ([c5c5397](https://github.com/BakerSean168/memoflow/commit/c5c5397c4267d0be18373e41b34b0b111add9b03))
* 实现真正的 agent（goal workflow） ([c0a6856](https://github.com/BakerSean168/memoflow/commit/c0a6856d5e93d573b788b956010d94d0c4a4a8e4))


### Bug Fixes

* action2 ([6cfac63](https://github.com/BakerSean168/memoflow/commit/6cfac63086e7f340f8ec4b799d36a992af8caca6))
* action3 ([1ea9475](https://github.com/BakerSean168/memoflow/commit/1ea9475e50cdab4f90b8181551d600380f022d6a))
* action4 ([02ba628](https://github.com/BakerSean168/memoflow/commit/02ba6287f1070f620f2e0fe1077c50f0aa976ca1))
* add domain-shared and account paths to vitest IPC config ([d0d4531](https://github.com/BakerSean168/memoflow/commit/d0d4531cb203b14eac4fd36790f719624737318c))
* add notification-runtime package to pnpm-lock.yaml and link dependencies ([3acc268](https://github.com/BakerSean168/memoflow/commit/3acc26895ca671453ae835f73662ada021618a98))
* add path resolution for domain-shared and account aliases in vitest config ([ce16b3d](https://github.com/BakerSean168/memoflow/commit/ce16b3d93f350e282dbfbf49aa57786c889a5cf5))
* align test specs with current type contracts ([ecca76c](https://github.com/BakerSean168/memoflow/commit/ecca76c1536c4f942e9e030a5a163403a0c165b5))
* **config:** add e2e test file patterns to ESLint configuration ([7fb353c](https://github.com/BakerSean168/memoflow/commit/7fb353cbfb4f3820e8186a073fe446a425c930b0))
* correct two TypeScript typecheck errors in spec files ([7fb540b](https://github.com/BakerSean168/memoflow/commit/7fb540b1d2d977d25f77125efe3b475feed11e6f))
* fix typecheck errors in spec files - title→name, import path, LocalePreferences casts ([bb319a9](https://github.com/BakerSean168/memoflow/commit/bb319a948396fbdf662264404bd0b9dc32d121b2))
* remove baseUrl from authentication tsconfig ([5acb063](https://github.com/BakerSean168/memoflow/commit/5acb063f6f3c44510d994dd6d08dc887febbd829))
* resolve pnpm cache issue in setup-node; implement actions/cache for pnpm store ([3fff4c0](https://github.com/BakerSean168/memoflow/commit/3fff4c00b766d5c27253e5cbc41c8585d39840b0))
* resolve two TypeScript typecheck errors in spec files ([e850d14](https://github.com/BakerSean168/memoflow/commit/e850d144143523c79f61d71514fa60bb3f643d51))
* **settings:** unwrap client results in web settings flows ([6392b81](https://github.com/BakerSean168/memoflow/commit/6392b81db571d44babb17b347ac49196085aea54))
* **task:** normalize template time config updates ([6d670fe](https://github.com/BakerSean168/memoflow/commit/6d670fe9a5f9f3107e3eed7f8649652ac565e845))
* **ui:** preserve dialog attrs for reminder flows ([b212a2b](https://github.com/BakerSean168/memoflow/commit/b212a2b6476ae917962f05b6c1a0fca68f09a1ea))
* update mapping methods to use create instead of fromDTO ([d1d7233](https://github.com/BakerSean168/memoflow/commit/d1d7233a780ca1841044c595e23bb19cb30340d5))
* update pnpm-lock.yaml to add @vue/test-utils, pinia, and vue dependencies ([c3ccb99](https://github.com/BakerSean168/memoflow/commit/c3ccb99ac3faa071445c2673d84e106e63d57849))
* update pnpm-lock.yaml to include http-client and bump vue-component-type-helpers version ([237bdba](https://github.com/BakerSean168/memoflow/commit/237bdba366f2502c88a999aa0c8c9eccdfb3ada1))
* update server cwd paths and adjust build commands in project configuration ([b475114](https://github.com/BakerSean168/memoflow/commit/b475114047988e880d165ef389ebd8df7420c221))
* update TaskInstanceCard.vue to use PascalCase timeType values ([61981f3](https://github.com/BakerSean168/memoflow/commit/61981f305a2b2fcf88667896f7370531a0da87a6))
* update TypeScript configuration and add test-utils paths; modify dependency status in task fixture ([3db9377](https://github.com/BakerSean168/memoflow/commit/3db93776e3fb529befb439788aaadab8fe5d9508))
* **web:** stabilize playwright e2e server startup ([5c6888d](https://github.com/BakerSean168/memoflow/commit/5c6888ddf59a091ff945015004948e5a9508c5f2))
* 修typecheck 任务，添加前置依赖；给 mobile 项目补充开发依赖 ([64a1101](https://github.com/BakerSean168/memoflow/commit/64a1101fd4e51d7cc52217a37312c0611c1d0b58))
* 修复 ruff 错误， 集成测试漂移， 统一测试环境 ([0c1c5ca](https://github.com/BakerSean168/memoflow/commit/0c1c5ca3d412cbfd044942244c5935ce6baf2ece))
* 修复action ([0832457](https://github.com/BakerSean168/memoflow/commit/0832457474535859561b00ef7d5e7eeb6e101928))
* 修复api 侧的 SSE 路由把 req.close 视为客户端断开导致没有响应的 bug ([f2d2da7](https://github.com/BakerSean168/memoflow/commit/f2d2da7292d7ce293139ed3bdb33de2d9718d653))
* 修复application层导出更新后， app层没有同步更改导致的报错 ([98bd278](https://github.com/BakerSean168/memoflow/commit/98bd2781aeaadfadd959fb83857e77eb7fab168e))
* 修复web端的笔记打开报错问题 ([1b5baaa](https://github.com/BakerSean168/memoflow/commit/1b5baaa6ac1c80e320c868ebcc5fb08972340def))
* 修复测试文件错误 ([fd58854](https://github.com/BakerSean168/memoflow/commit/fd58854d2755ad2b7c99748e77430bf47dd73945))
* 修复语言切换功能 ([9d484f5](https://github.com/BakerSean168/memoflow/commit/9d484f5e75be28cf4678ccbc572ec936a5bac372))
* 修复输出文件路径错误 ([e4a1cc7](https://github.com/BakerSean168/memoflow/commit/e4a1cc7876cd0a35ff5fe7afdf9c35d42ce39c7a))
* 修复进入 setting 页面会刷新主题为 auto的问题。修复editor路径配置问题 ([b9c0d43](https://github.com/BakerSean168/memoflow/commit/b9c0d4322eb16884f562c1fe9856ce40fe7a1b28))
* 修复错误JSON格式数据（多了个，） ([80bbd96](https://github.com/BakerSean168/memoflow/commit/80bbd962c00b35f2a6b59930c3137fbbc622ea9e))
* 更新 pnpmlock ([eac2f4a](https://github.com/BakerSean168/memoflow/commit/eac2f4a7df73903540852c18964fc994d57aae43))
* 正确实现了reminder模块的相关计数功能 ([9c329ca](https://github.com/BakerSean168/memoflow/commit/9c329cad957febd27a3c4eb6e1b6e9d62ce50cbb))
* 补充依赖 ([392ccee](https://github.com/BakerSean168/memoflow/commit/392ccee691d8b0154ff7fb984abcd3c8894ecd91))


### Performance Improvements

* Application-Client 层标准化计划 ([974fad8](https://github.com/BakerSean168/memoflow/commit/974fad8ca43a1db35b166bba4c2883aeaeb6a318))
* Application-Server 层标准化计划 ([f3f330c](https://github.com/BakerSean168/memoflow/commit/f3f330c5cf094abbf54c1d9dc8a0788f77da410a))
* contract中部分代码规范统一 ([693119a](https://github.com/BakerSean168/memoflow/commit/693119a5d26777117785fd298e343608f5a94a9f))
* Task Prisma Mapper toPersistence 统一接受聚合根 ([13ed935](https://github.com/BakerSean168/memoflow/commit/13ed93552407be3dcf7f4d58810a1a35cbe40a02))
* task 模块的contracts优化 ([e949dec](https://github.com/BakerSean168/memoflow/commit/e949dec12fccb72cf1bb5ee89432b76d0f67d983))
* 事件命名部分优化 ([cb027a6](https://github.com/BakerSean168/memoflow/commit/cb027a6be88268b1ddca0385bf0c97dc162f72ed))
* 事件总线相关更新 ([00a7d6e](https://github.com/BakerSean168/memoflow/commit/00a7d6ee0be920f6a56bb6ccadf2dbc42567cafd))
* 仓储层标准化 — 事务修复、Mapper 提取、共享工具 ([bbb9fc2](https://github.com/BakerSean168/memoflow/commit/bbb9fc2cee5af39eaee5899bee74bc80e16d11cc))
* 优1.化测试系统 2. 统一命令心智模型，使用 nx 命令 ([f6e5eda](https://github.com/BakerSean168/memoflow/commit/f6e5eda1a35212099eff9c62de0e1db9b1bd6d5a))
* 优化domain层代码，统一规范 ([77c10da](https://github.com/BakerSean168/memoflow/commit/77c10da0b6aed64e462284dbe346a506abc8e334))
* 优化配置文件和测试系统，添加覆盖率要求，完善goal模块的领域层的测试文件。基于TDD思想。 ([dac4a6c](https://github.com/BakerSean168/memoflow/commit/dac4a6ce68860dabdeed1663bca76405c9159b1c))
* 展示字段移除后相应的修改 ([c314df1](https://github.com/BakerSean168/memoflow/commit/c314df1b2b394131d5792ef68f4c8a5638407540))
* 测试系统（稳定器）的搭建。 优化 reminder 的 修改 template 的接口为 post 方法 ([07c6603](https://github.com/BakerSean168/memoflow/commit/07c6603506007fdaa47e6d9adda6c145d576e12d))
* 移除两个文件的跟踪 ([ee88046](https://github.com/BakerSean168/memoflow/commit/ee880466f38a420a6faa1040bd00a5059f07a910))
* 补充了 success、warning相关的主题 ([6bbf9e8](https://github.com/BakerSean168/memoflow/commit/6bbf9e8c0a5597e8b6d54ff92907e25d327393f2))

## [0.6.0](https://github.com/BakerSean168/memoflow/compare/v0.5.2...v0.6.0) (2026-04-18)


### Features

* add support for streaming messages with abort functionality ([69a88ff](https://github.com/BakerSean168/memoflow/commit/69a88ffe7af98e4909d57af986a229b0c75715f3))
* update vitest performance config for deterministic benchmarks and forked Node runtime ([8b9a9af](https://github.com/BakerSean168/memoflow/commit/8b9a9af61ae397f0c7c37442bb5b9624eb44ad03))


### Bug Fixes

* add missing entry for @memoflow/app-vue in desktop renderer and test configurations ([5bdb110](https://github.com/BakerSean168/memoflow/commit/5bdb1107fdd78d2e3a349bb9545dcecfae38b709))
* ensure current session before fetching auth status and bootstrap snapshot ([66e2141](https://github.com/BakerSean168/memoflow/commit/66e214149e8cc0524254c6f626dcebd049418ba7))
* **goal:** replace goal module initialization with Prisma-backed factory ([81c5ec7](https://github.com/BakerSean168/memoflow/commit/81c5ec7f3121dd4a5433cfa5041b4ffd622b2efe))
* **goal:** 修复专注模式目标显示与文案 ([4375103](https://github.com/BakerSean168/memoflow/commit/437510358a5bcb28abc2e42b69b041856b5f0f6a))
* improve vitest config comments for clarity on project setup and integration target ([8b9a9af](https://github.com/BakerSean168/memoflow/commit/8b9a9af61ae397f0c7c37442bb5b9624eb44ad03))
* update powersync image to use dynamic registry and tag variables ([b2b0e3d](https://github.com/BakerSean168/memoflow/commit/b2b0e3d516d7aa723e5a0af3086c8786f5b9c525))
* 修复 app-vue 没有子包导出的问题 ([2b94dfe](https://github.com/BakerSean168/memoflow/commit/2b94dfe2c07c5198268e776a8e79ac99352b0b53))
* 修复app-vue/web-notification 源码没有导出子路径问题 ([2d5ea79](https://github.com/BakerSean168/memoflow/commit/2d5ea797e77669f231e2304c5137102f42ae2cfd))
* 修复desktop端原生弹窗失效问题 ([cc9aa6f](https://github.com/BakerSean168/memoflow/commit/cc9aa6f3dd741f610830a5c76551e2de92b97e4f))


### Performance Improvements

* **app:** split startup entrypoints and lazy-load heavy shared features ([d04bb74](https://github.com/BakerSean168/memoflow/commit/d04bb74820075d5d9ba8ca999cea7316e0e20be1))
* ui-vue-shadcn实现深度子包导出 ([f9013eb](https://github.com/BakerSean168/memoflow/commit/f9013eb9c87ea139cc4fe4869a27917439384937))

## [0.5.2](https://github.com/BakerSean168/memoflow/compare/v0.5.1...v0.5.2) (2026-04-12)


### Bug Fixes

* remove token expiration handling from auth state updates ([b824d29](https://github.com/BakerSean168/memoflow/commit/b824d29c9d65c23dfb1e729c9928a76fc5f683d6))
* 修复桌面端构建问题，把powersync放到 asarUnpack 中。 还有优化构建目录，差分 package 和 renderer。 ([99ee1b9](https://github.com/BakerSean168/memoflow/commit/99ee1b918165e346ef5f938a8c784e547e74f0a9))


### Performance Improvements

* 优化desktop端的 powersync 同步数据库的连接语义和认证逻辑 ([7d7294a](https://github.com/BakerSean168/memoflow/commit/7d7294a634f69ee71f80f5940ab85aea49adf9ed))
* 优化配置，添加powersync的容器 ([08ce381](https://github.com/BakerSean168/memoflow/commit/08ce38147e01781355920320c9388903ef55a4b5))

## [0.5.1](https://github.com/BakerSean168/memoflow/compare/v0.5.0...v0.5.1) (2026-04-06)


### Bug Fixes

* 修复 native-rebuid 构建指令 ([0f0347f](https://github.com/BakerSean168/memoflow/commit/0f0347f6e3cea4bc512d2fdb7f5b635810ccacac))


### Performance Improvements

* 在desktop 端的 render也差分 auth 和 主应用 ([d648d2c](https://github.com/BakerSean168/memoflow/commit/d648d2c186ec50025c208035d40d43505ef28a00))

## [0.5.0](https://github.com/BakerSean168/memoflow/compare/v0.4.0...v0.5.0) (2026-04-06)


### Features

* initialize web application with Vite configuration, MSW mock handlers, and comprehensive E2E test suite ([54e3859](https://github.com/BakerSean168/memoflow/commit/54e3859babd507313a251e1ad02d6cf139846a4d))


### Bug Fixes

* add MSW handlers for settings and utility functions for component testing ([de83382](https://github.com/BakerSean168/memoflow/commit/de833826d387a18300c343d71be0767a41d61e62))
* **deploy:** stabilize production web delivery ([8ffcd65](https://github.com/BakerSean168/memoflow/commit/8ffcd65fd16e3bc3fdab774893c5df6385a88847))
* 修复 github action 构建产物流程的错误：1. 明确 electron 版本。 2. 把 argon2 也明确原生编译 ([a3edbea](https://github.com/BakerSean168/memoflow/commit/a3edbea4ad874d023979ae275185dc59aa53fd51))
* 修复锁文件不一致导致的报错 ([be38d2f](https://github.com/BakerSean168/memoflow/commit/be38d2fea2184e2c6eb4ecaedaa9bffd879c72d0))


### Performance Improvements

* web端首包构建优化，拆分auth和主页面的js ([c76065c](https://github.com/BakerSean168/memoflow/commit/c76065c080fe9d5ef13774d20dbe12291ac7549f))

## [0.4.0](https://github.com/BakerSean168/memoflow/compare/v0.3.0...v0.4.0) (2026-04-05)


### Features

* add user data path utilities and enhance logging ([cdba01b](https://github.com/BakerSean168/memoflow/commit/cdba01b94c17c4f141061226cda724663aabeedf))
* deploy ([ca80405](https://github.com/BakerSean168/memoflow/commit/ca80405c1f7ea9742ef12cccc81be496e6727039))
* enhance page navigation with action drawers and improve UI consistency ([93dca44](https://github.com/BakerSean168/memoflow/commit/93dca44f0df133d4732edfe088a2940ef0825aee))
* enhance test database configuration with environment variables ([09836a1](https://github.com/BakerSean168/memoflow/commit/09836a14b16dbf9e185dc1e4c7366598bde2912f))
* implement centralized error handling middleware, Docker CI/CD pipeline, and IPC result adapters for cross-platform consistency. ([8a7c5e3](https://github.com/BakerSean168/memoflow/commit/8a7c5e3bea046ea34c3f44db23e6d01626a8b944))
* implement global error middleware, add AI workspace hook, and configure UI/mobile project structures ([cad47f1](https://github.com/BakerSean168/memoflow/commit/cad47f16880434fa3e1db00d16d9683937854163))
* 任务模板依赖图和依赖相关属性增强 ([79a0ee1](https://github.com/BakerSean168/memoflow/commit/79a0ee1eda18eeabf0a1901517f7c5ef237e4254))
* 初始化react-native，手机端 ([c797cbd](https://github.com/BakerSean168/memoflow/commit/c797cbd4271dbba1ee5628367dc0765a4f4b7525))
* 初步实现 mobile 端 ([4c27377](https://github.com/BakerSean168/memoflow/commit/4c27377ad5d4ccf3ceeaf351ce4730f38868515f))


### Bug Fixes

* action1 ([bf7906b](https://github.com/BakerSean168/memoflow/commit/bf7906ba03e900ddf2b4798219a829826fe27141))
* action2 ([96fb889](https://github.com/BakerSean168/memoflow/commit/96fb8890ea5c99bcc970c7a2bc99baca0ba8e2d7))
* action3 ([a65596e](https://github.com/BakerSean168/memoflow/commit/a65596ee1acc053f92458bf4f28d3d8723be221b))
* **ai:** normalize result errors and polish web chat workspace ([706ab26](https://github.com/BakerSean168/memoflow/commit/706ab26c2f0dba4907203d06922613fc8f2aa1c1))
* docker deploy fix ([02f0e70](https://github.com/BakerSean168/memoflow/commit/02f0e70f9a81e5776d9eff52578ed6db3881b5db))
* hardcode database credentials in test workflow for consistency ([3545c43](https://github.com/BakerSean168/memoflow/commit/3545c43bfa4a957c5ee93d4a28ba5d054c4ff5d2))
* taskId 问题 ([4eaf02a](https://github.com/BakerSean168/memoflow/commit/4eaf02a638f1916700bb7ee5fa9d56d64b9fe516))
* **ui-core:** use cryptographically secure randomness for passwords ([5dd7137](https://github.com/BakerSean168/memoflow/commit/5dd713774fcb40d681e5a947ed10628f377896e2))
* **ui-core:** use cryptographically secure randomness for passwords ([cde3118](https://github.com/BakerSean168/memoflow/commit/cde31188535c3c3bc41309107ad10220e1c618da))
* update lodash version and add assets dependency in pnpm-lock.yaml ([ce8b792](https://github.com/BakerSean168/memoflow/commit/ce8b79281149d6d5ad0981da72ee3a2aaab6702e))
* 修复冷启动后访客模式的 id 会重新生成而非 读取磁盘上已有 guest token 的问题 ([d05b8e2](https://github.com/BakerSean168/memoflow/commit/d05b8e2e962bb73c4975a39ea1d912f5b726313c))
* 修复图标路径错误导致托盘图片空白的问题 ([bb361b3](https://github.com/BakerSean168/memoflow/commit/bb361b391bf850c96cf667687d2906895449774c))


### Performance Improvements

* uuid 库移除的锁文件更改 ([1d6bd6b](https://github.com/BakerSean168/memoflow/commit/1d6bd6b6b6c30659369727e19fb698bee555d8d3))
* 优化 uuid相关方法移除 uuid库 ， 使用 原生 crypto.randomUUID 的方法，并且统一工具函数，移除重复文件 ([ef60854](https://github.com/BakerSean168/memoflow/commit/ef60854a15b66dabc4b5973e62f02f5f9c8dda5f))

## [0.3.0](https://github.com/BakerSean168/memoflow/compare/v0.2.0...v0.3.0) (2026-03-29)


### Features

* **reminder:** add endpoint and logic for retrieving today's reminder schedule ([0f54230](https://github.com/BakerSean168/memoflow/commit/0f542308d9acc2fe0d9a285d5d504e5eba0a5164))
* **task:** implement date range filtering for task instances ([0f54230](https://github.com/BakerSean168/memoflow/commit/0f542308d9acc2fe0d9a285d5d504e5eba0a5164))


### Bug Fixes

* action ([f3861ac](https://github.com/BakerSean168/memoflow/commit/f3861acb6cffa4b55066f0003986814fe5019bfd))
* action release assert ([b3607bd](https://github.com/BakerSean168/memoflow/commit/b3607bd66e5da497cd9fa5a53b442e6c0154a25a))

## [0.2.0](https://github.com/BakerSean168/memoflow/compare/v0.1.0...v0.2.0) (2026-03-29)


### Features

* add @nxlv/python plugin and update dependencies ([db72fea](https://github.com/BakerSean168/memoflow/commit/db72fea047508af1808cf02929293a9690a7411f))
* Implement structured error handling for desktop authentication and result processing ([75343cc](https://github.com/BakerSean168/memoflow/commit/75343cc4959da93060cff628cb7862a47d40ec18))
* Refactor identityId usage in AIChatApplicationService tests for consistency ([f56b83d](https://github.com/BakerSean168/memoflow/commit/f56b83dd8ea7980f5b367b3086c19f1f6dd38444))
* 初始化ai-service项目 ([eb1c0a8](https://github.com/BakerSean168/memoflow/commit/eb1c0a819feeabb7350570e575e25a45d4713ba8))
* 初步实现 python 服务 ([610720e](https://github.com/BakerSean168/memoflow/commit/610720e5065ef45813b184ee8d7b6cd109375361))
* 初步实现chat功能 ([05afce3](https://github.com/BakerSean168/memoflow/commit/05afce35af8cc2de8149ff5ce1d3b9b1406337b4))


### Bug Fixes

* action ([ed2ed15](https://github.com/BakerSean168/memoflow/commit/ed2ed154355212766fe067e0b9ed698118282ad9))
* action2 ([2cf6f78](https://github.com/BakerSean168/memoflow/commit/2cf6f784b58d4676620a572a045fb863996e2f83))
* action3 ([8e44cf2](https://github.com/BakerSean168/memoflow/commit/8e44cf2605e2764715fe7d9200d34c36e6c47b87))
* 修复 ai 模块历史记录问题等，优化goal模块样式布局，在详情页使用环形图展示进度 ([591fdd1](https://github.com/BakerSean168/memoflow/commit/591fdd1f45f2da2b5afcdae081677d154c0d96ca))
* 修复 ai 配置问题 ([9d4f154](https://github.com/BakerSean168/memoflow/commit/9d4f154d1c0d3b9dad24a0f379eb4f2a24e9f80f))


### Performance Improvements

* action ([0296b04](https://github.com/BakerSean168/memoflow/commit/0296b0441ee2cbff2f81ded215301db2e6aacb51))
* 优化设置项，移除ai悬浮球 ([7fd9dd4](https://github.com/BakerSean168/memoflow/commit/7fd9dd4ba29e87ea343cdc7d24e6991ac796dd33))
* 移除多余文本，实现ai模型选则持久化 ([430d8aa](https://github.com/BakerSean168/memoflow/commit/430d8aa3470d4b16f97b6bd32601546a7762002a))

## [0.1.0](https://github.com/BakerSean168/memoflow/compare/v0.0.1...v0.1.0) (2026-03-23)


### Features

* add ActiveDocumentPane component to RepositoryWorkspaceView ([81759d3](https://github.com/BakerSean168/memoflow/commit/81759d31ffb3918f58aa679ac8856bf2e57eec87))
* add tests for resource deletion and mutations ([958f517](https://github.com/BakerSean168/memoflow/commit/958f517144313a91a294eda18fec8771e337581b))
* implement dashboard data aggregation and related services ([afe3773](https://github.com/BakerSean168/memoflow/commit/afe377321a4c143165d1480a46ee02aa3f64ad55))
* implement Prisma repositories for editor sessions and tabs ([c9dbd53](https://github.com/BakerSean168/memoflow/commit/c9dbd53f724c04d5ddf363f6506c2179f9a2749b))
* **reminder:** add user preferences management and update template/group handling ([14ffe5c](https://github.com/BakerSean168/memoflow/commit/14ffe5cf52bcf8fd34bf44cce432cdfd023def1c))
* unify sidebar creation and repository tree actions ([7ed2513](https://github.com/BakerSean168/memoflow/commit/7ed25133154bcad23ad6fdc2b14aac251edf39d0))
* update identity IDs in tests and services for consistency ([969715e](https://github.com/BakerSean168/memoflow/commit/969715e55c0c71ea5d952111429f3256f9311840))
* 任务和目标联动 ([aa5886f](https://github.com/BakerSean168/memoflow/commit/aa5886f58a1b4bdff574c48ab6fdd331d486a00a))
* 实现确实的功能，优化领域事件架构 ([72b738c](https://github.com/BakerSean168/memoflow/commit/72b738c63ac530c0cd0c6c50c1128d3c3b77caae))


### Bug Fixes

* action release ([21a6cd2](https://github.com/BakerSean168/memoflow/commit/21a6cd28fe2031a5f73e31c472a30892d36ee25f))
* action1 ([022804e](https://github.com/BakerSean168/memoflow/commit/022804e23976cb80ccce92cfd1d06d5e4b6ad2ce))
* action1 ([bc7649b](https://github.com/BakerSean168/memoflow/commit/bc7649b595c33ae0660b3752d21bfe254ad08c12))
* action2 ([a450e61](https://github.com/BakerSean168/memoflow/commit/a450e61523e37bc3fe18eead09e54286720a35ee))
* **auth:** resolve guest id validation error and update logout warning ([e25da64](https://github.com/BakerSean168/memoflow/commit/e25da642233979e21622fcc6a939474071b1845e))
* **ci:** resolve governance lint and typecheck regressions ([5f27d1f](https://github.com/BakerSean168/memoflow/commit/5f27d1f3da9e8a760cd6eff2d28dcab6b41510bd))
* Desktop 访客模式仓库笔记创建后无法打开问题复盘 ([db47c12](https://github.com/BakerSean168/memoflow/commit/db47c122f22490a3fd287d457cf86c2e9aa46249))
* **editor:** resolve disabled new note button and unresponsive note opening ([71898c0](https://github.com/BakerSean168/memoflow/commit/71898c051067a66dbccd512bc833fbe6096fe2e0))
* goal  模块国际化，keyresult创建，值，创建复盘等的优化 ([115787e](https://github.com/BakerSean168/memoflow/commit/115787e02b27101b1545657ae1a5a02550709a6c))
* identityId ([de0af1a](https://github.com/BakerSean168/memoflow/commit/de0af1a897bf853c42f966b17cfd176c65fd45e7))
* refactor pause functionality to delete incomplete instances and update related tests ([5870d95](https://github.com/BakerSean168/memoflow/commit/5870d954338d91d5b0f4437fdffbfe2479d1ad26))
* release ([bb66691](https://github.com/BakerSean168/memoflow/commit/bb666917a7bdf960906909a7ca2fac01cc3c8092))
* resolve disabled new note button and unresponsive note opening ([e1ee5ba](https://github.com/BakerSean168/memoflow/commit/e1ee5baa0fadd91279428dcdb1731c2868ddda4a))
* resolve guest id validation error and update logout warning ([e44dcc7](https://github.com/BakerSean168/memoflow/commit/e44dcc7b4681ca2177db6a84747c2da15d60245e))
* **typecheck:** restore workspace package resolution for CI ([001ae00](https://github.com/BakerSean168/memoflow/commit/001ae00da68a02e6643904111209da2f0c7cfe5e))
* **ui:** remove duplicate type fields and resolve id prefix warnings ([2f41d6a](https://github.com/BakerSean168/memoflow/commit/2f41d6a020fdb246f1aae7ed9e71914fedf648c0))
* **ui:** remove duplicate type fields and resolve id prefix warnings ([9e5ce5a](https://github.com/BakerSean168/memoflow/commit/9e5ce5af7378f13b31d46b028d2b6706d936f5f3))
* update tab management and improve ActionableWrapper usage for better responsiveness ([20b452a](https://github.com/BakerSean168/memoflow/commit/20b452a3821a505fc02f0be13aad8f978efa72a5))
* 修复 goal card 的 krs显示 0/0 问题 ([0bd03f7](https://github.com/BakerSean168/memoflow/commit/0bd03f7fd54a81d551e368938e42e7dfc84bb598))
* 修复 identity问题 ([7c8b933](https://github.com/BakerSean168/memoflow/commit/7c8b933a45cda04104b9a856339f2dd1704d16f3))
* 修复 schedule 中任务实例完成后报错的错误，还有统计信息错误的问题 ([7f910ce](https://github.com/BakerSean168/memoflow/commit/7f910cef0b0c65aa959daad09643b7de42d2e0e2))
* 修复desktop identityId导致问题 ([4edd4ac](https://github.com/BakerSean168/memoflow/commit/4edd4accf1902c523f82e4c3de4da4fab32ee12d))
* 修复desktop源码引用路径错误问题 ([c66aae1](https://github.com/BakerSean168/memoflow/commit/c66aae11df3d958609e0b579c7f11bd471ef33ba))
* 修复goal传入 identity问题 ([466cf01](https://github.com/BakerSean168/memoflow/commit/466cf013964f02604a1fd0b6b2270ce4a417e8e1))
* 修复reminder模块数据格式不对其问题，并收缩相关的数据类型定义 ([2678d7c](https://github.com/BakerSean168/memoflow/commit/2678d7cf2eb77c8bc6044225037e82761a3f116b))
* 修复tab 不能正确切换的问题 ([d5072de](https://github.com/BakerSean168/memoflow/commit/d5072def73428212ed05930f02ac1f7376eb61e4))
* 修复进入不了主页面问题 ([4f7efa2](https://github.com/BakerSean168/memoflow/commit/4f7efa27470b1932f00f8b3d023d8ab9b5afa611))
* 初始实现编辑器功能 ([935363e](https://github.com/BakerSean168/memoflow/commit/935363e823bf4982144fe9ca6016f8a0aa22797f))
* 本地登录的id问题 ([f34ba06](https://github.com/BakerSean168/memoflow/commit/f34ba06674fa56761bd34c55d5d14dc0bf09a1db))
* 统一和修复reminder 的表单无法滚动问题 ([9f26b05](https://github.com/BakerSean168/memoflow/commit/9f26b05dd4cde0779e9e8a1ad4ec64b414573a56))


### Performance Improvements

* 使用自定义的标题栏按钮，而非electron原生按钮 ([aa23345](https://github.com/BakerSean168/memoflow/commit/aa233452f88df0838b60c06b5101428d421518b1))
* 添加goal调试代码 ([ebc27a5](https://github.com/BakerSean168/memoflow/commit/ebc27a57acaf100eea5466889653bd9b76be0095))
* 补充实现，优化旧代码 ([157941e](https://github.com/BakerSean168/memoflow/commit/157941e04b20de0106714fddb1229527db0fa810))

## [0.0.1](https://github.com/BakerSean168/memoflow/compare/v0.0.1...v0.0.1) (2026-03-13)


### Features

* 1 ([3b0903c](https://github.com/BakerSean168/memoflow/commit/3b0903c604a29549c7de905b1d3b05991f5c900e))
* 1 ([149c459](https://github.com/BakerSean168/memoflow/commit/149c4599ea921351c0a3e19095bd5c5a98916628))
* account and auth modules 的 contracts 和 domain 包的实现 ([9711a09](https://github.com/BakerSean168/memoflow/commit/9711a09e00284284a43b69b6d6460ddd707c7704))
* account and authentication and governance full stack(partial) ([96bf7bc](https://github.com/BakerSean168/memoflow/commit/96bf7bcf9c7d77679e98dce233eaa4fa5e640e9d))
* account and authentication packages ([a5aef9e](https://github.com/BakerSean168/memoflow/commit/a5aef9e19240be3dd293629f8c22d0f477717ee6))
* add ai module as a workspace dependency and update pnpm lockfile ([dfd3a23](https://github.com/BakerSean168/memoflow/commit/dfd3a230822069ecd2fea5d1fcd02e46c7e8fd5d))
* add electron entry and externals to tsup configs for multiple packages ([3b081ad](https://github.com/BakerSean168/memoflow/commit/3b081adcace24afb0063c84375be2608ceaa0647))
* add expressAdapter and ipcAdapter with unit tests (ADR-026, ADR-027) ([e5474b5](https://github.com/BakerSean168/memoflow/commit/e5474b50586e609cc53e4441cb5142526bfe897d))
* add GoalController and refactor goal routes to use expressAdapter ([1642ece](https://github.com/BakerSean168/memoflow/commit/1642ece208a67dcfd4243d81263dc85d55d1fb4a))
* add GoalStatistics aggregate and update related imports ([a0a1789](https://github.com/BakerSean168/memoflow/commit/a0a1789de75e9fd01d5b15666def06a060c58db2))
* add GoalTimeRange value object for managing goal time periods ([c46e25b](https://github.com/BakerSean168/memoflow/commit/c46e25b5dfcdb60ac0854d516199cf17e5295527))
* add MSW + Faker mock infrastructure for contract-driven development ([0750f5a](https://github.com/BakerSean168/memoflow/commit/0750f5aba073ad618e90b3cfdcd246b12fe21e80))
* add OpenAPI generator and registry for API documentation ([4cbf712](https://github.com/BakerSean168/memoflow/commit/4cbf712073a849642baaa1eaef9cbec20c7a1f8e))
* Add PowerShell script to update agent context files ([e223882](https://github.com/BakerSean168/memoflow/commit/e2238823e40dbddc0f40a1c14e28214683cd4e96))
* add script to find UUID property usages in source files ([47da47c](https://github.com/BakerSean168/memoflow/commit/47da47cf26cd030c90c687a53549a50fdd159285))
* add Storybook stories for all editor module components ([bbb8eab](https://github.com/BakerSean168/memoflow/commit/bbb8eabe6d81bc5320e702445073f197949eaf3a))
* add value objects for task management including CompletionRecord, RecurrenceRule, TaskGoalBinding, TaskReminderConfig, and TaskTimeConfig ([0fba00c](https://github.com/BakerSean168/memoflow/commit/0fba00cc08d535abc45e029f14b17424d36d665f))
* add version and deletedAt fields to multiple server interfaces ([0afecf9](https://github.com/BakerSean168/memoflow/commit/0afecf963fd1b63dccf0c584dca1a8ddd300ee12))
* **api:** 使用新的模块白名单组装方式 ([979398f](https://github.com/BakerSean168/memoflow/commit/979398f2fdc3a11b87eb0777106c2395dcc47459))
* **app-vue:** add editor module with composables ([d37d30a](https://github.com/BakerSean168/memoflow/commit/d37d30a1b2953bea046328196529b7ed981105cd))
* **app-vue:** add notification module with store, composable, and router ([2793320](https://github.com/BakerSean168/memoflow/commit/27933203af6bdf093a0cacc99e2fb0eb357c6730))
* **app-vue:** add reminder module with store, composable, utils and router ([8b487a5](https://github.com/BakerSean168/memoflow/commit/8b487a535e1bf662ff856be7c04ab9efe2e89fd5))
* **app-vue:** add repository module with store, composable, and router ([3a1b2ca](https://github.com/BakerSean168/memoflow/commit/3a1b2cafaa5dc782401129eb237da5d6edf851c2))
* **app-vue:** add schedule module with store, composable, and router ([40c0047](https://github.com/BakerSean168/memoflow/commit/40c004710055909ac1b8545a81f113f894b23326))
* **app-vue:** add setting module with stores, composables, and router ([89bee5a](https://github.com/BakerSean168/memoflow/commit/89bee5a7c62f71c3d396ef667b40f14621900bfb))
* **app-vue:** add task module with types, store, composable, and router ([07d8899](https://github.com/BakerSean168/memoflow/commit/07d88997b9efaf0fc2147295befc138112409aa9))
* **app-vue:** implement TaskManagementView with template management ([7bef446](https://github.com/BakerSean168/memoflow/commit/7bef44663ac8af4df8d57e01abea165a7b7d35b3))
* **app-vue:** migrate account module as phase2 continuation ([c62df62](https://github.com/BakerSean168/memoflow/commit/c62df620206cac539dcecedc310586ac2c2ee71a))
* apply RouteRegistrar pattern to all API modules ([17bf103](https://github.com/BakerSean168/memoflow/commit/17bf103928e0e22460ab5aa2610b6a074eb7aca6))
* Architecture Audit Remediation Checklist ([e72cba1](https://github.com/BakerSean168/memoflow/commit/e72cba1da94974a051ae57999f0b35169aaaeaff))
* complete extraction of all 14 Repository module components to ui-vue-shadcn ([bc6aa58](https://github.com/BakerSean168/memoflow/commit/bc6aa5841c67f24b77120efd537681f1ab0fd646))
* Complete extraction of all 40 Goal module components to ui-vue-shadcn ([d832c05](https://github.com/BakerSean168/memoflow/commit/d832c057334137b9cf25167224494182f17d4dc7))
* contract-driven mock infrastructure with MSW + Faker ([02d4854](https://github.com/BakerSean168/memoflow/commit/02d485494ab297c22cc81bbc7833c0d08fac74d6))
* **database:** 提取 daatabase package ([e7b4c98](https://github.com/BakerSean168/memoflow/commit/e7b4c98cf6237e2029a99b6fe061cfbb34db5a9d))
* define base contracts for RPC/events across all modules ([9958145](https://github.com/BakerSean168/memoflow/commit/9958145132f313b4d3a5eefa279078584680b819))
* **desktop:** add custom desktop notifications with user preference toggle ([4713800](https://github.com/BakerSean168/memoflow/commit/471380057722b7a90614f9e21ca3966e11914752))
* **desktop:** implement custom system-level notifications and user settings ([2487953](https://github.com/BakerSean168/memoflow/commit/2487953cd0a014b8bc6c7799718eea1f94f2a99b))
* **desktop:** optimize window controls layout to a floating widget ([228bf9c](https://github.com/BakerSean168/memoflow/commit/228bf9cabef479146ea939123c99471bf0caab8a))
* domain-shared ([8ec12c0](https://github.com/BakerSean168/memoflow/commit/8ec12c035cedea0554fd078868f8c2e162e4a4d0))
* **editor:** implement complete API module with routes, handlers, and initialization ([9497949](https://github.com/BakerSean168/memoflow/commit/94979493d78c55a8fccc4eb4d650ac0cae7edbbd))
* enhance authentication flow with remembered accounts and password encryption ([e4fd1ea](https://github.com/BakerSean168/memoflow/commit/e4fd1ea3dcab8a3a905c8faf8a02ecbc241c1969))
* enhance CI workflow and improve error handling in authentication and reminder services ([5d91926](https://github.com/BakerSean168/memoflow/commit/5d919265228f012f92f49a21c92129b59a7d4ae7))
* Enhance domain server modules with detailed documentation and structure ([5e3840d](https://github.com/BakerSean168/memoflow/commit/5e3840db8ea5c132c07b5c4569e98d23ec614a28))
* enhance ESLint configuration and add module boundary enforcement rules ([bb52839](https://github.com/BakerSean168/memoflow/commit/bb52839805620117fcb3ccfe38a10b72e3758d9a))
* **example-module:** add aggregates, API endpoints, and value objects ([d17e825](https://github.com/BakerSean168/memoflow/commit/d17e825fc5a2d919cb0a5a5aa12fcbf4499d7c52))
* **example-sample:** create a new code sample package showcasing project structure and best practices ([d79f0e9](https://github.com/BakerSean168/memoflow/commit/d79f0e92a031abd36b462f095ab3ef7993d3c6e4))
* extract 8 priority repository components to shadcn/ui ([11b01c7](https://github.com/BakerSean168/memoflow/commit/11b01c747b6ab110551cca4a980e75b11b7d48c1))
* extract Prisma mapper classes into dedicated mappers/ directories ([bf3590d](https://github.com/BakerSean168/memoflow/commit/bf3590d8a23d6355310321a8a776567c4e71c392))
* global vue compnents parttens ([2c132a4](https://github.com/BakerSean168/memoflow/commit/2c132a4cb8ff66e5092eeaf6b2cd88a8bd8da55f))
* goal progress calculate ([1bdcf3e](https://github.com/BakerSean168/memoflow/commit/1bdcf3e7ae505ea3e8e0aa6542c2869e38384c26))
* goal-priority-calculator ([b4e36ba](https://github.com/BakerSean168/memoflow/commit/b4e36babe54126e5707d54ad9c46505919255cc1))
* **goal:** add GoalClientService with constructor injection and Result types ([29f0522](https://github.com/BakerSean168/memoflow/commit/29f0522fec6ca131acd2d33328726219e5a83036))
* **goal:** improve i18n for goal pages ([c3e85de](https://github.com/BakerSean168/memoflow/commit/c3e85deb3989b8b08d31fa78a7ed74f879220661))
* **goal:** internationalize hardcoded strings in goal views ([9fdcf72](https://github.com/BakerSean168/memoflow/commit/9fdcf7208adba9ce96186a1f94055000cc368b3c))
* **goverance:** story1.1 ([00b7274](https://github.com/BakerSean168/memoflow/commit/00b727485715370df5e2bd8e5b530d97e06b7d43))
* **governance:** add complete contracts layer with events, RPC, and API definitions ([2e07918](https://github.com/BakerSean168/memoflow/commit/2e07918a6045f1052942535e8988a83476276cbe))
* **governance:** add governance module with CRUD functionality and initialization tasks ([424c030](https://github.com/BakerSean168/memoflow/commit/424c030be4f15403bc86c1f68eec1ebb065fd2d4))
* **governance:** application层+axios实例优雅实现 ([8b57187](https://github.com/BakerSean168/memoflow/commit/8b57187425ec5b58bda0d68ea61b5deda95b49d0))
* **governance:** implement contracts and domain-shared value objects ([2cf2786](https://github.com/BakerSean168/memoflow/commit/2cf27861ae9e382855300870ea27aec580e58c63))
* **governance:** implement domain-server layer (Rule aggregate + RuleRevision entity) ([f8ebf40](https://github.com/BakerSean168/memoflow/commit/f8ebf40d1013c8c1182eef6e475e3c66b8635567))
* **governance:** implement rule creation with validation, RBAC, and testing setup ([4e60791](https://github.com/BakerSean168/memoflow/commit/4e607916e6573a051c6cd96c89e49d422a69156d))
* **governance:** story ([357e98c](https://github.com/BakerSean168/memoflow/commit/357e98cb1ad2622e93b71e97dd75bcd23540f6ac))
* **governance:** 初步实现 governance 模块的 contracts、domain-shared、domain-client、domain-server ([12a67d1](https://github.com/BakerSean168/memoflow/commit/12a67d1f437f52b5f5c234ad72c8b94b33002ba9))
* **http-client:** export IResultHttpClient interface and create resultHttpClient instance ([841de8d](https://github.com/BakerSean168/memoflow/commit/841de8daf6189ab4564eff87ae6377f4ada61aa9))
* implement Linear-style page views for all modules ([2f50590](https://github.com/BakerSean168/memoflow/commit/2f505903ef946afa59d4ab7d96b8b7939a441300))
* implement RepositoryContentAdapter and update DI wiring ([e3b383c](https://github.com/BakerSean168/memoflow/commit/e3b383c5e278e42c248905e02aca9043a3f73cdb))
* implement update task template service and related changes ([65b5fb4](https://github.com/BakerSean168/memoflow/commit/65b5fb44f9d9cde6f8bb975ed879c784a2468697))
* implement zz-refactor phase1 app-vue skeleton ([939a3d8](https://github.com/BakerSean168/memoflow/commit/939a3d8c9a9a2217d241bf5d46dbbe4e9a35fde5))
* integrate date-fns for date manipulation in task scheduling ([fd305e4](https://github.com/BakerSean168/memoflow/commit/fd305e49848565df70de99b1c0b91ed1454b6f63))
* integrate PowerSync with renderer-side database and IPC handlers ([060daea](https://github.com/BakerSean168/memoflow/commit/060daea66cc92b34e51d4b26c9138e9878dd0755))
* integrate zod-to-openapi for automatic API documentation ([236eccf](https://github.com/BakerSean168/memoflow/commit/236eccf3e7e44683220f11a472c40f82cae0d29f))
* introduce domain errors for user settings management ([867a0e4](https://github.com/BakerSean168/memoflow/commit/867a0e4ebeb567c4e29125a893db776b6fd4b8e4))
* **ipc-client:** 实现 ipc-client 包 ([5381ead](https://github.com/BakerSean168/memoflow/commit/5381ead9732d7452883c9fbe5bc3aee19e51cf1c))
* migrate all modules to packages/app-vue ([6399277](https://github.com/BakerSean168/memoflow/commit/63992774f9f01d36283c5ab98931efae5d1368a7))
* migrate goal module presentation layer to app-vue ([2f0406d](https://github.com/BakerSean168/memoflow/commit/2f0406db6f370856cd9b5dddb9519bd4cfe96fac))
* migrate goal module presentation layer to app-vue ([96e52e1](https://github.com/BakerSean168/memoflow/commit/96e52e1beff287881176261f37f4781ba24f8a96))
* migrate governance module to packages/app-vue ([7ad0794](https://github.com/BakerSean168/memoflow/commit/7ad0794161c73bc4482f6fbcd7548eb181e87391))
* migrate remaining 7 modules (task, schedule, reminder, repository, notification, setting, editor) to app-vue ([e4fee71](https://github.com/BakerSean168/memoflow/commit/e4fee71522e2b05981a9a372a7c4a5fdfa676496))
* mocks ([da9367d](https://github.com/BakerSean168/memoflow/commit/da9367d948874f5b1d2cb3c8441b53671af421be))
* **notification:** add DTOs for notification preferences and queries ([94e4626](https://github.com/BakerSean168/memoflow/commit/94e4626ff838f0d61e0fd043d8fc1b409e553a0d))
* **notification:** implement API module with routes, handlers, and initialization ([eb0eaa3](https://github.com/BakerSean168/memoflow/commit/eb0eaa32fc1ee63959c6b2b2ca01c932345c36ab))
* Phase 0/2/3/5 - Delete legacy code, JSONB storage, new aggregate, patch API ([7aa5694](https://github.com/BakerSean168/memoflow/commit/7aa5694dbf4acd32b944879979b7df580d921522))
* Phase 1 - Zod-first contracts, new events, simplified DTOs ([be02704](https://github.com/BakerSean168/memoflow/commit/be027040e2138e96bc0ebf9878cdaf5831ba40bf))
* Phase 6 - Desktop sync, SQLite JSONB, cleanup legacy VOs and entities ([c7b4223](https://github.com/BakerSean168/memoflow/commit/c7b42233764a1d15ef10375d41598c5d0c17d16b))
* **prisma:** add initial Prisma schema configuration for PostgreSQL ([b05d9cf](https://github.com/BakerSean168/memoflow/commit/b05d9cfe304e80c5167211b72935df96dffcd763))
* **prisma:** update Prisma commands in package.json and project.json for improved integration ([74ecbe6](https://github.com/BakerSean168/memoflow/commit/74ecbe6c9f547765eead8c0bfd1e6a5ed7d1011f))
* refactor Editor, Setting, Governance, Authentication, Account, Repository modules ([a2b4671](https://github.com/BakerSean168/memoflow/commit/a2b46716e90c3c0f04abab5ff28cb76ac58ff93a))
* refactor ExampleHistory entity and introduce ExampleTag entity ([023f54e](https://github.com/BakerSean168/memoflow/commit/023f54e21e369baa1471579e9fd2812890d59ef1))
* Refactor internal state interfaces across various entities to improve type safety and clarity ([1dc7928](https://github.com/BakerSean168/memoflow/commit/1dc79288c1d0e91d7f3055b04bff0bd5f17e01c6))
* refactor Reminder, Schedule, Notification modules to use expressAdapter ([3976532](https://github.com/BakerSean168/memoflow/commit/397653241b1d03b906c9072aaea3fc62b6946e13))
* Refactor SqliteTaskInstanceRepository and SqliteTaskTemplateRepository for improved data handling and status normalization ([ff95580](https://github.com/BakerSean168/memoflow/commit/ff9558097d2dc9f83c10a8d72c6173049f81031b))
* refactor Task module to use expressAdapter and add OpenAPI docs ([dffc517](https://github.com/BakerSean168/memoflow/commit/dffc5173c6b8dee88d6b8f398e54d29450990ad7))
* refactor TaskManagementView to improve UI and functionality ([47da47c](https://github.com/BakerSean168/memoflow/commit/47da47cf26cd030c90c687a53549a50fdd159285))
* Refactor TaskTemplateHistory entity and related DTOs ([4d1dae6](https://github.com/BakerSean168/memoflow/commit/4d1dae69bd3a672ba5bbce82320b48cf207b671c))
* **refactor:** move task components to ui-vue and fix CI ([8b6e1ad](https://github.com/BakerSean168/memoflow/commit/8b6e1adc5394678599c14093b9da704d60a511c5))
* **reminder:** add reminder group and template routes with CRUD operations ([59e6e8a](https://github.com/BakerSean168/memoflow/commit/59e6e8a0cf76e5e72a4e92f9ff74a8b8e355c995))
* **reminder:** implement API module with routes, initialization, and module wiring ([7cf1eab](https://github.com/BakerSean168/memoflow/commit/7cf1eab7a1b96e201e8d04b563e9e0a2ac0c833b))
* **reminder:** introduce reminder group and template DTOs ([94e4626](https://github.com/BakerSean168/memoflow/commit/94e4626ff838f0d61e0fd043d8fc1b409e553a0d))
* remove OpenAPI registration for governance, notification, reminder, repository, schedule, setting, and task modules ([5a7d809](https://github.com/BakerSean168/memoflow/commit/5a7d809a29314d0f8730867cc4e139881ac1d44e))
* remove OpenAPI registrations for governance, notification, reminder, repository, schedule, setting, task modules ([51fd79a](https://github.com/BakerSean168/memoflow/commit/51fd79aa4a42758a05df952dee6597919463b987))
* remove remaining ui-vue packages files ([78d0a65](https://github.com/BakerSean168/memoflow/commit/78d0a654b9245ea57c82b9652740980d5e16c06a))
* remove TaskTemplateHistory and related value objects; add Subtask entity ([cb0420c](https://github.com/BakerSean168/memoflow/commit/cb0420c687dc81b08caf480f7362452d6f54a012))
* **repository:** implement API module with routes, handlers, and initialization ([b8352fe](https://github.com/BakerSean168/memoflow/commit/b8352fe19b6d40c7c958256e4b1d82502aff379b))
* **repository:** mark monolithic services as deprecated ([39375fc](https://github.com/BakerSean168/memoflow/commit/39375fcc002fccb7c17ad2a05e002586e5bd3666))
* **repository:** support yaml frontmatter and file storage ([013d5fc](https://github.com/BakerSean168/memoflow/commit/013d5fcee5bf3ecdb2c507bba9ffe5f330ac3a42))
* **repository:** support yaml frontmatter and file storage ([2a58766](https://github.com/BakerSean168/memoflow/commit/2a587664ced45bc0073fe134b82ad835d87e4127))
* **research:** document Phase 0 research decisions for MemoFlow productivity platform ([aeb8343](https://github.com/BakerSean168/memoflow/commit/aeb83435d6353a1729082b271bd3517325565f49))
* **schedule:** add use-case pattern for schedule operations ([25b000e](https://github.com/BakerSean168/memoflow/commit/25b000e74ee1dfc7432d11938f459d0b1a3d3eea))
* **schedule:** implement complete API module with routes, initialization, and module wiring ([179289b](https://github.com/BakerSean168/memoflow/commit/179289b4cef3026b12ae0bf946450ae2d0f04850))
* server-side adapter pattern, controller layer for all modules, and zod-to-openapi documentation ([7688bb4](https://github.com/BakerSean168/memoflow/commit/7688bb44471e8ba677c95be417d8f332dadabe87))
* **setting,notification,goal:** mark monolithic services as deprecated ([cd293d8](https://github.com/BakerSean168/memoflow/commit/cd293d81ab8e4bfd598dfbad6845ff187e28d4dd))
* **setting:** implement API module with routes, initialization, and module wiring ([cf3e593](https://github.com/BakerSean168/memoflow/commit/cf3e593b53a72ea8970307ff06b07ddd2cea1e3e))
* **task:** enhance task management with new DTOs ([94e4626](https://github.com/BakerSean168/memoflow/commit/94e4626ff838f0d61e0fd043d8fc1b409e553a0d))
* **task:** mark monolithic application services as deprecated ([7f483b4](https://github.com/BakerSean168/memoflow/commit/7f483b4d83d4e12d0ee4e7634234cb2eda6ca830))
* **ui-vue-shadcn:** add and upgrade Storybook stories for goal module components ([5dd0413](https://github.com/BakerSean168/memoflow/commit/5dd0413d12ab10e717aec06b3dddb66e63032aa2))
* **ui-vue-shadcn:** add stories for all components ([e025b7a](https://github.com/BakerSean168/memoflow/commit/e025b7aa6608fa8b48c0e8068f93011ce2d773f0))
* **ui-vue-shadcn:** add Storybook stories for governance, notification, and reminder modules ([ae81836](https://github.com/BakerSean168/memoflow/commit/ae818365fd1cb69afc9058c5a482ab0557faa039))
* **ui-vue-shadcn:** add Storybook stories for schedule and setting components ([7302e91](https://github.com/BakerSean168/memoflow/commit/7302e910a230ebd70029af5e37ff9c32931477ae))
* **ui-vue-shadcn:** add/upgrade goal module stories (Part 2) ([ded0f15](https://github.com/BakerSean168/memoflow/commit/ded0f15a35ae80a3eff860b2a3959ba0de12eb74))
* **ui-vue-shadcn:** add/upgrade Storybook stories for repository module ([775dd25](https://github.com/BakerSean168/memoflow/commit/775dd25177467eb5e1625baf87c68bba6d7a3cf0))
* **ui-vue-shadcn:** extract 9 setting components from apps/web ([b30bbe7](https://github.com/BakerSean168/memoflow/commit/b30bbe7bde25ae9defe2b39f32891224ae21318b))
* **ui-vue-shadcn:** extract all 9 remaining editor components from apps/web ([56b3b2b](https://github.com/BakerSean168/memoflow/commit/56b3b2b3bc36cf009b2a429b1db67446acab3958))
* **ui-vue-shadcn:** upgrade 22 scaffold stories to complete implementations ([97458ee](https://github.com/BakerSean168/memoflow/commit/97458eecc618730f446d3edd13b2fd6b82ce1c4e))
* **ui:** implement Linear-style theme and refactor TaskInstanceCard ([867ab73](https://github.com/BakerSean168/memoflow/commit/867ab7377bd93b3c06fa51f0efad91f204a88682))
* unify API response types and complete all module API registrations ([417d5ae](https://github.com/BakerSean168/memoflow/commit/417d5ae6cc14f458ceb7bbadfb53cfcb58319290))
* update bmad ([d35e7d2](https://github.com/BakerSean168/memoflow/commit/d35e7d2a6f181006310615b76186f4159c19b73a))
* update prisma to v7 ([0b6f01f](https://github.com/BakerSean168/memoflow/commit/0b6f01f019f59f6dee1174617510c6a91f3b0dc1))
* **web:** Refactor modules to Linear-style UI (Vue + Shadcn) ([3f7788e](https://github.com/BakerSean168/memoflow/commit/3f7788ec6d9b6dfbe2306ad52f0ceb49186cb1ea))
* 主题实现+颜色优化 ([3e03646](https://github.com/BakerSean168/memoflow/commit/3e0364634782eecfd2677ea432221e6ab283f2d4))
* 优化ai实现 ([2ea3328](https://github.com/BakerSean168/memoflow/commit/2ea3328356f13017b87edd4f2fe692110cf59520))
* 优化导入，包内详细命名导入 ([a51db87](https://github.com/BakerSean168/memoflow/commit/a51db87cc00eb994ad796d65a1e4329dbbbcfc49))
* 优化数据库，添加错误处理 ([ffd4707](https://github.com/BakerSean168/memoflow/commit/ffd47077ea9c963e220b99b3215d0afd6932495f))
* 初始化 bmad 任务，开始创建 governance 模块 ([259409e](https://github.com/BakerSean168/memoflow/commit/259409e6207c46e3eae54e1bcc22e1134bddb556))
* 前端页面修复+ repository + task 模块 apt test系统搭建 ([d6a6f83](https://github.com/BakerSean168/memoflow/commit/d6a6f831574be00f93cb087f8907366fb96d4f7a))
* 合并 env 到根目录，并配置 storybook ([bd3f2c9](https://github.com/BakerSean168/memoflow/commit/bd3f2c96f16542790d464a8e3c8ff7f2b4307d6e))
* 国际化 ([338b624](https://github.com/BakerSean168/memoflow/commit/338b624267299b2fdfc57f3d4726c0b7c29b4d02))
* 完成 repository editor p0 创作闭环 ([0026301](https://github.com/BakerSean168/memoflow/commit/002630160a6b6444c37ddd877c265a32e44be588))
* 完成 repository editor p1 p2 资源协同能力 ([1b6f1a0](https://github.com/BakerSean168/memoflow/commit/1b6f1a0ceab532a2e9bc9a8f9e56fe6aa149f46a))
* 实现desktop端 application-client 注入 ([abc9a3d](https://github.com/BakerSean168/memoflow/commit/abc9a3dc3ca56608854cd67bde1bab542da7b620))
* 导入前端mcp ([2a2cf2a](https://github.com/BakerSean168/memoflow/commit/2a2cf2a5da87e353e0787a078fd8ae66a6e36a24))
* 开始全新重构 account 模块的 domain 层；优化了 utils 中的事件总线系统，新增了 domain-shared 包 ([089da4d](https://github.com/BakerSean168/memoflow/commit/089da4dc15db6dc771a232cf592ec9ce0ed094ed))
* 打通 repository 工作区与 editor 链接能力 ([a1a66f6](https://github.com/BakerSean168/memoflow/commit/a1a66f6daea5b1b8ceaa7718f7f3f7e5c6a733ae))
* 添加 goal-folder 相关路由 ([689668f](https://github.com/BakerSean168/memoflow/commit/689668f02c35ca732778db4ea8345c25c7a3d722))
* 添加 schedule-event （日程事件）相关路由 ([8bfa6f6](https://github.com/BakerSean168/memoflow/commit/8bfa6f6a58eab347ab5231ef15c0f7876c03d357))
* 添加任务模板时间配置功能，支持时间类型和时间值的展示与编辑 ([87ab0a8](https://github.com/BakerSean168/memoflow/commit/87ab0a891e1d573b4d78bfd05c2ba72a6daffad2))
* 自动发布领域事件的仓储基类 ([723735a](https://github.com/BakerSean168/memoflow/commit/723735ab7c22a5b87502e2ce6226de349b2f5cb8))
* 补充所有确实的路由 ([6185117](https://github.com/BakerSean168/memoflow/commit/61851170059e6083f5c00cd37eeb1491cac1b932))


### Bug Fixes

* action1 ([39229e9](https://github.com/BakerSean168/memoflow/commit/39229e959d887a248931d6940c088c7e653a927b))
* action2 ([76b68b2](https://github.com/BakerSean168/memoflow/commit/76b68b25e7558a3a1f762c9c709d879475a55e7c))
* action3 ([7a6e82d](https://github.com/BakerSean168/memoflow/commit/7a6e82d536b650e34a17a4279abd775efa542da0))
* action4 ([187422e](https://github.com/BakerSean168/memoflow/commit/187422e2487eacd3319a18023cc371aab01680d1))
* address code review feedback on mapper files ([8c371b9](https://github.com/BakerSean168/memoflow/commit/8c371b98aa50e3093c1194d0b38922ec7320b8f9))
* address review feedback for app-vue skeleton ([a3ac1f8](https://github.com/BakerSean168/memoflow/commit/a3ac1f817a8fb3c1c0edcbee6cb30769a1e4c0a4))
* ai,editor,task,goal,notification,repository.schedule prisma repository and peisma model ([728f790](https://github.com/BakerSean168/memoflow/commit/728f790c7b48855b5fe820bce4632a60c216bef1))
* **app-vue:** access preferences via correct nested path in getCategory ([b0f6744](https://github.com/BakerSean168/memoflow/commit/b0f67445c2b51682e6d49df4c501d87437cf3080))
* **app-vue:** align account view labels with vue template attrs ([25416e7](https://github.com/BakerSean168/memoflow/commit/25416e74c436e8fbf252f3ab4c01d94a8de84278))
* **app-vue:** resolve lint errors in components ([7e01d9d](https://github.com/BakerSean168/memoflow/commit/7e01d9d559d1657d6bbb482edce3c3c2eb0ee435))
* audit compliance with refactor docs — strict inject in goal, remove leftover BASE constant, register all module routes ([7a44556](https://github.com/BakerSean168/memoflow/commit/7a4455692fccf0e2d5553a66861e7a48ff351d0d))
* auth\reminder ([a78e8c6](https://github.com/BakerSean168/memoflow/commit/a78e8c62ebdb03662d5492f1e3d2d9286be4b8dc))
* authentication ([2bc9273](https://github.com/BakerSean168/memoflow/commit/2bc92730489c5ba7dcdd8c4f439593847bc31002))
* change enum type definition in response-schemas.ts for GoalReviewClientDTO ([bb52839](https://github.com/BakerSean168/memoflow/commit/bb52839805620117fcb3ccfe38a10b72e3758d9a))
* **ci:** disable nx cloud to resolve build failure ([eee64fe](https://github.com/BakerSean168/memoflow/commit/eee64fef88eb7a76093e82cbef723442ff5f5e99))
* **ci:** Resolve build errors in schedule, editor, ipc-client and governance packages ([4657f7c](https://github.com/BakerSean168/memoflow/commit/4657f7c464fd9c55ca75b2abc38a1a0cd75026e2))
* **ci:** Sync pnpm-lock.yaml with package.json changes ([49a5cff](https://github.com/BakerSean168/memoflow/commit/49a5cfffb6aeffea22a7be1a32c689eb9fe817a9))
* **contracts:** Update auth mock to match new AuthIdentityClientDTO shape ([2650b9f](https://github.com/BakerSean168/memoflow/commit/2650b9fb7dda809e71508ef51611b231de12ddf1))
* **database:** update Account model to use id for identity relation and change package name ([f11fe2c](https://github.com/BakerSean168/memoflow/commit/f11fe2cb64ff8fa22426618eec2db9577cc6cee6))
* **desktop:** handle mock settings and window offset coordinates ([103a004](https://github.com/BakerSean168/memoflow/commit/103a0045492677a51891c63e25d5e608ddc91997))
* **desktop:** resolve typecheck failure on ipc registry import ([0fb63ee](https://github.com/BakerSean168/memoflow/commit/0fb63ee22af5cca078fe2f41e9cec1b51912459b))
* **desktop:** resolve typecheck failure on ipc registry import ([91d58ec](https://github.com/BakerSean168/memoflow/commit/91d58eccab81f1c7c634494f22b4fb1ea4589340))
* disable package manager caching in CI workflows for consistency ([c554a52](https://github.com/BakerSean168/memoflow/commit/c554a5249f64385a17284f076a08cda64c0341f0))
* editor etc for api project ([2813752](https://github.com/BakerSean168/memoflow/commit/2813752cbe7333d6c7ea70849a3d89a4737d8646))
* eliminate any type code smells and enable ESLint warnings ([ca72e06](https://github.com/BakerSean168/memoflow/commit/ca72e064ed112e04179327deb276fee53d48b04f))
* remain error ([3881dfa](https://github.com/BakerSean168/memoflow/commit/3881dfa51bdaabdf9aa7008e8537b1ff971c9e20))
* remove duplicate tslib dependency in governance package.json ([af58b44](https://github.com/BakerSean168/memoflow/commit/af58b441aeb7e219e52efe08ace7642bbb260007))
* remove extra whitespace in task-folder-server.ts import ([38128e8](https://github.com/BakerSean168/memoflow/commit/38128e8aa0b9723774ade87ecc16ac53f8f39785))
* remove stub useGoal composable from components/composables ([bc288be](https://github.com/BakerSean168/memoflow/commit/bc288bec68fc547d2d042f5f73a97297f75d35f6))
* replace `any` types with `unknown` across contracts/utils and enable ESLint any/unused-vars warnings ([88f87d1](https://github.com/BakerSean168/memoflow/commit/88f87d1c9f26e04a2f489f6076f2e7710eca056a))
* replace any types in account and auth-session Prisma repositories ([f47f562](https://github.com/BakerSean168/memoflow/commit/f47f562b0bc44f2f7e3e52913fedb0dd9b5f62ed))
* replace any types with proper Prisma types in all Prisma repository implementations ([de5b64b](https://github.com/BakerSean168/memoflow/commit/de5b64bb7b2b6a5d0ef784f2597c4c155996af78))
* replace prisma: any with PrismaClient in skeleton repositories and providers ([9c4e61c](https://github.com/BakerSean168/memoflow/commit/9c4e61c0801cec7758cbab6ecc6c826e9a006460))
* **repository:** address path traversal and module identity bugs ([3da98c8](https://github.com/BakerSean168/memoflow/commit/3da98c8b31646c48546cf0036f518515bf14ef46))
* repository模块primitives类型导出问题 ([a479170](https://github.com/BakerSean168/memoflow/commit/a4791708c667456faa8035074693d4423738770f))
* resolve CI build errors in ai and contracts packages ([16fd67b](https://github.com/BakerSean168/memoflow/commit/16fd67b094dde9854efdf21814d6336c7506c4bb))
* resolve CI build errors in ai and contracts packages ([daf5260](https://github.com/BakerSean168/memoflow/commit/daf5260353c960af7588cb5c2d3c8b1172697fb0))
* resolve DTS build errors - add @memoflow/http-client to externals and fix barrel exports ([f59502a](https://github.com/BakerSean168/memoflow/commit/f59502a5b5d5478b067c8444ddfa0baa8b8c1de6))
* resolve persistent CI type and test container failures ([3d9f4b6](https://github.com/BakerSean168/memoflow/commit/3d9f4b6244e532f595255ced9249a9399d2395d7))
* resolve pervasive typescript errors in desktop, api, app-vue, ui-vue-shadcn ([8a536c7](https://github.com/BakerSean168/memoflow/commit/8a536c752df6465180f158b4e6c6de9c034ffe43))
* resolve type errors from Prisma string-to-enum conversions ([9fc2e7f](https://github.com/BakerSean168/memoflow/commit/9fc2e7ff449e34531e44e7e2fcd6ebed76ffc627))
* resolve type errors in composables - implicit any, Result handling, import paths ([c14a5e7](https://github.com/BakerSean168/memoflow/commit/c14a5e7f4b77c8bec785d7d0d2379d32434c1799))
* resolve typecheck errors - update barrel exports, fix Zod defaults, update clients ([559ae97](https://github.com/BakerSean168/memoflow/commit/559ae97e54377c5ddd668fc670a3f09207d0e29f))
* resolve TypeScript type mismatches in view implementations ([cda1bbd](https://github.com/BakerSean168/memoflow/commit/cda1bbd9e5f34a39938a2151eb441191db7fd943))
* resolve typing and interface mock issues for desktop build ([8507a9c](https://github.com/BakerSean168/memoflow/commit/8507a9cc45a2dae571cd91033805db0106f10bbf))
* tailwind配置冲突问题 ([31a5cc6](https://github.com/BakerSean168/memoflow/commit/31a5cc6b582caa23761915fdd38963dd05fc7054))
* task ([0565556](https://github.com/BakerSean168/memoflow/commit/0565556e90f0082142b2d967cb0c4b4d137cf6bc))
* ui-vue-shadcn ([986998d](https://github.com/BakerSean168/memoflow/commit/986998df5e798bc4baeb55f14ba561885649ac4d))
* update goal service to handle Result&lt;T&gt; pattern correctly ([e4d9ac8](https://github.com/BakerSean168/memoflow/commit/e4d9ac839f412b67edffef0e4089030824c0a77b))
* update MSW handlers to match actual HTTP adapter paths ([7400be8](https://github.com/BakerSean168/memoflow/commit/7400be899c06218b23f3b7a4c1a3e5c3fe126e8b))
* use state.filter.tags instead of this.filter.tags in governance store getter ([0250d37](https://github.com/BakerSean168/memoflow/commit/0250d37b5b90714a0863fb71c8f80e5c9577f41a))
* **web:** account\authentication ([7ffb54c](https://github.com/BakerSean168/memoflow/commit/7ffb54c6c8f1bf31dbae6fe3879b26023dbe2e4c))
* **web:** resolve nx build errors related to worker format, heap size, and dtos ([fea1204](https://github.com/BakerSean168/memoflow/commit/fea1204610c53f2945297074a8be1246229e5470))
* 主进程改为使用 cjs，优化sqlite 的schema ([de31ed3](https://github.com/BakerSean168/memoflow/commit/de31ed3d2aae1977cf49fe7950cb4af5a00467a7))
* 修复（优化）id格式的验证 ([689668f](https://github.com/BakerSean168/memoflow/commit/689668f02c35ca732778db4ea8345c25c7a3d722))
* 修复ai模块引用repository 模块的错误架构 ([a3c385d](https://github.com/BakerSean168/memoflow/commit/a3c385df68f4c6a62e7e5166edec5727120128dd))
* 修复ai相关错误，使用 alias vite 配置来实现构建，后续应该统一使用 构建引用 ([3e93e98](https://github.com/BakerSean168/memoflow/commit/3e93e981a3c5ff5bed3a1ed12505c8370a61fc62))
* 修复desktop端登录黑屏和不显示toast错误 ([fcd76cc](https://github.com/BakerSean168/memoflow/commit/fcd76cc62921fc83364e227226bb4b0abf5cb663))
* 修复goal模块的字段展示问题 ([cbd5113](https://github.com/BakerSean168/memoflow/commit/cbd511378b964db4559aa268aed02a5e62199c39))
* 修复mock数据错误，优化前端界面 ([3c5256f](https://github.com/BakerSean168/memoflow/commit/3c5256fd444ffd849b44fe64b0506a9c17bb4d34))
* 修复powersync 没生效问题 ([34ad3df](https://github.com/BakerSean168/memoflow/commit/34ad3df99eba9c2863811ef03e35cb7fda91bb22))
* 修复redix中select选项不能为空导致的错误 ([f8818be](https://github.com/BakerSean168/memoflow/commit/f8818bee763ca3f038126ec9202724811df9ce54))
* 修复前后端联调时的问题 ([8823394](https://github.com/BakerSean168/memoflow/commit/882339441156ffa6e004026b4f529a16da94ccdf))
* 修复前端页面的部分问题 ([ebf5960](https://github.com/BakerSean168/memoflow/commit/ebf596069f13d4d717718909667363bfd9f2de79))
* 修复各个模块存在的问题 ([2fa9749](https://github.com/BakerSean168/memoflow/commit/2fa97497c97e49446c384c0fbf1715d72ed014fc))
* 修复后端运行路径以及 powersync 和 认证token 不会自动刷新或者重定向到登录页面的问题 ([c65ab18](https://github.com/BakerSean168/memoflow/commit/c65ab1839f5c848683f042e09023c3582b56ec4a))
* 修复多个模块中 identityId 的处理方式，确保正确映射到领域实体 ([7d65b44](https://github.com/BakerSean168/memoflow/commit/7d65b4433cdbc2df7ee918f7b3180d96636da7ae))
* 修复当前离线登录报错原因（在线登录时没有正确存储正确的identityid，而生成了本地id） ([d224dbd](https://github.com/BakerSean168/memoflow/commit/d224dbdcf28925cd73416e5fac0ae5b1a1cb3bbd))
* 修复数据库的列名、类型定义错误 ([50d9370](https://github.com/BakerSean168/memoflow/commit/50d9370080ef72bb24bf6cf2b36ac4aa69f18da8))
* 修复枚举类型修改后导致的问题，优化notification 和 ai 模块 ([88be736](https://github.com/BakerSean168/memoflow/commit/88be7367560a2b3d924a51090bbf27e8d2d69fa4))
* 修复枚举类型修改后导致的问题，优化notification 和 ai 模块 ([702e96a](https://github.com/BakerSean168/memoflow/commit/702e96a8de79fca6c6f6dd3b326e5663a13a888b))
* 对齐desktop端的register 和 login 返回的数据。移除 覆盖 preload.js问题 ([2fbf9a6](https://github.com/BakerSean168/memoflow/commit/2fbf9a60a09d3ac7e671154f2befb40ed767f688))
* 导入 sonner 的样式，修复toast不显示的问题 ([fe5bc30](https://github.com/BakerSean168/memoflow/commit/fe5bc301e01c33c7201607ba91359fc83953a163))
* 打包构建问题修复 ([78f479e](https://github.com/BakerSean168/memoflow/commit/78f479e136fab5a2f57dcf3269c181ebe4dc832a))
* 收敛 desktop 认证远程流程并补齐主进程测试 ([2ea3328](https://github.com/BakerSean168/memoflow/commit/2ea3328356f13017b87edd4f2fe692110cf59520))
* 移除了 Goal 模块临时调试日志（后端 + 前端）：goal-prisma.repository.ts, goal-sqlite.repository.ts, list-goals.ts, goal.routes.ts, useGoal.ts。 ([5721708](https://github.com/BakerSean168/memoflow/commit/5721708b6c554bbb194c28a9643732560bc53f73))
* 让用户已存在错误继承domainerror ([7c0c2f1](https://github.com/BakerSean168/memoflow/commit/7c0c2f174cc3b9a496152d554b03e11d54abc400))


### Performance Improvements

* action ([b392441](https://github.com/BakerSean168/memoflow/commit/b392441f025920d077f9e63b1e8922cba4d06990))
* goal ([0407fd7](https://github.com/BakerSean168/memoflow/commit/0407fd79e25abfbae65381c5fcabcc03ee8d8bf0))
* optimize AnalyzeReminderFrequency to eliminate N+1 query ([ce98291](https://github.com/BakerSean168/memoflow/commit/ce982916d455364be2f8fa61da8d519931f834fd))
* optimize filtering logic in ReminderTemplateControlService ([f478e78](https://github.com/BakerSean168/memoflow/commit/f478e78e0c02e8a2ab5f69bffec69bfa8f83bb9e))
* 优化tailwind 的配置和导入顺序 ([fe5bc30](https://github.com/BakerSean168/memoflow/commit/fe5bc301e01c33c7201607ba91359fc83953a163))
* 优化使用主题色，而非写死 ([4c31acf](https://github.com/BakerSean168/memoflow/commit/4c31acfacf130416250849050de8b5f19fee7f37))
* 将认证功能合并到共享包中， desktop 项目通过注入实现特殊方法 ([c109177](https://github.com/BakerSean168/memoflow/commit/c1091775e0713864bd091f0e14b58e42f22b0b20))
* 提取 schema 代码，优化 desktop 依赖配置 ([056844c](https://github.com/BakerSean168/memoflow/commit/056844c97419b9f5fd9f74e5fc88f10766c9777a))
* 提取 taginput组件到共享层，优化桌面端顶部栏布局 ([4ac04a9](https://github.com/BakerSean168/memoflow/commit/4ac04a9b8aa16d5604eba14ddf41a8652a0bc69a))
* 注释转英文，消除乱码 ([561d532](https://github.com/BakerSean168/memoflow/commit/561d5322d35cf1bb25006ccfbc4056709b9667d9))
* 移除前端和渲染进程的powersync，主进程的认证流程优化 ([8db5a91](https://github.com/BakerSean168/memoflow/commit/8db5a913a2655a1014779712e118f9cd4b7a79fa))
* 统一枚举类型为大驼峰命名法,authentication in contracts ([d48a57a](https://github.com/BakerSean168/memoflow/commit/d48a57a6bf045a887a436a8d71bb4b8d043f7db2))
* 统一枚举类型为大驼峰命名法,authentication,task ([78241cf](https://github.com/BakerSean168/memoflow/commit/78241cf4eca08dca8dbc0791d11f3a336a218110))
* 统一枚举类型为大驼峰命名法，优化 repository 模块的仓储层布局 ([ac371d3](https://github.com/BakerSean168/memoflow/commit/ac371d32e3c8b9cb7f6567fab65c39af3c690539))
* 认证契约统一 ([ff6e768](https://github.com/BakerSean168/memoflow/commit/ff6e76889cea0dbddbdd4c70a67b852c7af6b1d8))


### Reverts

* restore original Prisma generated files ([820b35e](https://github.com/BakerSean168/memoflow/commit/820b35e23f270179a700ed7affc7cce33d0920db))


### Miscellaneous Chores

* release 0.0.1 ([014a43e](https://github.com/BakerSean168/memoflow/commit/014a43ee09b3cfa1931334ad22d4b819325c2a0e))
