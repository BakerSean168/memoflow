---
tags: [plan, ai, chat, t3-code, ui, model-picker]
description: MemoFlow chat composer model-picker / traits / permissions parity with T3 Code.
created: 2026-10-11T00:00:00Z
---

# MemoFlow · Composer model picker and permissions

## Ground truth

- MemoFlow base: `d381bf442be34d49a1aa0c5b681564bfc2ffec64`, PR #445 already deployed on Staging. This branch is isolated from main and Staging.
- T3 Code examined from `pingdotgg/t3code@f769e01e28c80745621a699ed5ee021cc78039b6`: `ProviderModelPicker.tsx`, `ModelPickerContent.tsx`, `TraitsPicker.tsx`, `composerProviderState.tsx`.
- T3 composer concept: **model picker (instance-sidebar + model directory) → conditional capability-validated traits → runtime permissions**. It is not three separate Agent / Model / Permissions dropdowns.
- MemoFlow model inventories (`AIModelInfo`, `LocalAgentModel`) do not expose reasoning/service-tier capabilities and neither current native nor Mastra turn payload accepts these options. Displaying actionable Medium/High/Fast values would be deceptive until there is a real capability + execution contract.

## Implementation slice

1. Replace separate Agent and Model selects with one searchable Model Picker popover, per-instance navigation, favorite model keys stored locally, model-provider subtitle, unconfigured/disabled status, settings entry, keyboard and responsive positioning.
2. Preserve authoritative Agent Registry and immutable conversation bindings: choose an agent/model tuple atomically; agent changes start a new conversation instead of silently rebinding a prior thread. Native model discovery remains probe-driven, not guessed.
3. Add a compact read-only model-options control explaining that options come from real Agent capabilities; no unimplemented values are sent. It is explicitly a placeholder, not completion of backend Traits dispatch. Keep the control accessible without giving it a fake selected effort.
4. Render a compact exclusive permission popover with **only enforced modes** (Mastra Supervised/Read-only; native Supervised/Auto-approve). This is not a UI-only Full Access mode.
5. Replace obsolete tests with component and browser tests (search, favorites, multiple same-driver instances, switch semantics, permissions, mobile and split viewport); update only intentional visual baselines. Run Nx lint/typecheck/governance, real Playwright onboarding E2E, CI.
6. No production data reset, no direct Staging deployment and no change to Provider credentials.

## Acceptance

- Model controls never present an unsupported Agent/model pair; same model ID across multiple connections retains exact instance+provider identity.
- Favoriting never changes the selection. One popover at a time; both menus anchor above composer and fit 390px / ~530px / desktop widths.
- User can select a Mastra model across instances with a single action; existing conversation never silently changes its model owner.
- No fake reasoning or permission levels.
- PR is reviewed and CI-green before merge/deploy.

## Implementation and validation (2026-10-11)

The dedicated worktree `fix/composer-model-picker-traits` implements the combined T3-style model picker, a compact non-deceptive Traits disclosure and mutually exclusive enforced permission modes. It retains the shared Agent Registry/ModelResolver, supports searchable per-instance model directories, favorite tuples, source labels, and selecting a new Agent/model pair without reassigning an existing conversation. Favorites are scoped to the authenticated Web identity / Desktop Profile by the host-provided identity resolver; missing identity never writes a global favorite list.

Source comparison: `pingdotgg/t3code@f769e01e28c80745621a699ed5ee021cc78039b6`; inspected ProviderModelPicker, ModelPickerContent, TraitsPicker, composerProviderState and ChatComposer. No upstream source was copied.

Evidence from isolated GCP Dev:

- Vue component and selection tests: **39/39 passed** across three targeted spec files, including favorites per identity and cross-instance same-model-ID separation.
- Real Web/API/browser provider flow: **2/2 P0 passed** (1 intentionally opt-in case skipped), including 1440px/530px/390px real popover bounding-box validation, model-to-permissions exclusive opening, model favorites, persistent credentials, return-to-chat no page reload, owner isolation and CAS. Tested against a new temporary PostgreSQL database that was removed after completion.
- Web/Desktop four Shell visual baselines updated and verified in normal non-update mode: **8/8 passed**. Screenshot changes were inspected for layout regressions.
- `app-vue:typecheck`, `web:typecheck`, builds/dependencies, scoped ESLint/Prettier and governance all passed.
- A simultaneous broad test/inventory attempt hit the pre-existing resource contention: Vitest enumeration was interrupted and the browser timed out at cold-login navigation. Targeted tests and browser were re-run _serially_ without reproduction. The full CI run for this PR remains the authoritative broad verification.

### Intentional defer: executable model traits

The current `AIModelInfo` and native model inventory do not declare authoritative reasoning effort/service tiers; the associated Web/Desktop run payloads do not accept these options. A read-only explanation of default native behavior is therefore displayed rather than a fake Medium/High/Fast setting. Proper end-to-end Traits requires a separate reviewed provider capability/probe contract, model-type-specific validation, persistence and runtime forwarding. This limitation is explicit and must not be represented as a completed T3 capability implementation.

### Rollout gate

No direct Staging or production mutation. PR must pass exact-head CI and independent authenticated Staging acceptance before release. The existing `main` Dev and Staging remain unchanged while this branch is reviewed.

### Browser visual evidence (synthetic test account)

- [Composer three controls](../../analysis/evidence/2026-10-11-composer-picker/composer-three-controls.png)
- [Model picker, 390px viewport](../../analysis/evidence/2026-10-11-composer-picker/model-picker-390.png)
- [Model picker, 530px viewport](../../analysis/evidence/2026-10-11-composer-picker/model-picker-530.png)
- [Permissions, 390px viewport](../../analysis/evidence/2026-10-11-composer-picker/permission-picker-390.png)

Final serialized `pnpm test:inventory` completed successfully (1,379 discovered files). After the isolated browser regression and mocked capability tests passed, the only remaining broad gate is exact-head GitHub CI on the new pull request.
