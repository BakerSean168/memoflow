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
3. Render the Traits control only when an installed native Agent's live model catalog advertises executable options. Codex exposes Reasoning and Service Tier; Claude Code exposes SDK Effort. The selected options travel through the strict Desktop command contract and are checked again against the current owner-scoped model catalog before native execution. Mastra, Pi and DSH hide Traits when no executable capability is reported. Keep the control accessible without giving it a fake selected effort.
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

The dedicated worktree `fix/composer-model-picker-traits` implements the combined T3-style model picker, model-capability-driven conditional Traits and mutually exclusive enforced permission modes. It retains the shared Agent Registry/ModelResolver, supports searchable per-instance model directories, favorite tuples, source labels, and selecting a new Agent/model pair without reassigning an existing conversation. Favorites are scoped to the authenticated Web identity / Desktop Profile by the host-provided identity resolver; missing identity never writes a global favorite list.

Source comparison: `pingdotgg/t3code@f769e01e28c80745621a699ed5ee021cc78039b6`; inspected ProviderModelPicker, ModelPickerContent, TraitsPicker, composerProviderState and ChatComposer. No upstream source was copied.

Evidence from isolated GCP Dev:

- Vue component and selection tests: **39/39 passed** across three targeted spec files, including favorites per identity and cross-instance same-model-ID separation.
- Real Web/API/browser provider flow: **2/2 P0 passed** (1 intentionally opt-in case skipped), including 1440px/530px/390px real popover bounding-box validation, model-to-permissions exclusive opening, model favorites, persistent credentials, return-to-chat no page reload, owner isolation and CAS. Tested against a new temporary PostgreSQL database that was removed after completion.
- Web/Desktop four Shell visual baselines updated and verified in normal non-update mode: **8/8 passed**. Screenshot changes were inspected for layout regressions.
- `app-vue:typecheck`, `web:typecheck`, builds/dependencies, scoped ESLint/Prettier and governance all passed.
- A simultaneous broad test/inventory attempt hit the pre-existing resource contention: Vitest enumeration was interrupted and the browser timed out at cold-login navigation. Targeted tests and browser were re-run _serially_ without reproduction. The full CI run for this PR remains the authoritative broad verification.

### Executable native model traits (follow-up to PR #447)

- Codex `model/list` fields `supportedReasoningEfforts`, `defaultReasoningEffort`, `serviceTiers` / legacy `additionalSpeedTiers` and `defaultServiceTier` are projected into the strict Desktop-native model catalog. Per-turn choices are mapped to `turn/start.effort` and `turn/start.serviceTierForTurn`.
- Claude Code's installed Agent SDK initialization supplies `supportsEffort` and `supportedEffortLevels` when available. Only reported levels are exposed, and explicit choices flow into `query(options.effort)`.
- An optional strict `nativeModelOptions` field is permitted only for `runtimeKind=local_agent`; web/Mastra requests containing native options are rejected. The Desktop host checks the selected model and options against a fresh owner-scoped native probe before starting the turn. Any unknown/unsupported value fails closed.
- The Composer hides Traits when the selected model does not report executable options. Native choices stay scoped to the current Agent connection and model ID, so switching Agent/model cannot leak settings to another instance.
- Unchanged: Mastra, Pi, DSH do not gain invented Reasoning options, and native model discovery/probing requires a Desktop runtime. Default execution omits unset parameters.

Native per-model choices currently last for the mounted Composer session, not persistent thread-level preferences. Agent-defined service tiers are exposed only when the native model catalog explicitly reports them; there is no guessed list of providers or models.

### Rollout gate

No direct Staging or production mutation. PR must pass exact-head CI and independent authenticated Staging acceptance before release. The existing `main` Dev and Staging remain unchanged while this branch is reviewed.

### Browser visual evidence (synthetic test account)

- [Composer three controls](../../analysis/evidence/2026-10-11-composer-picker/composer-three-controls.png)
- [Model picker, 390px viewport](../../analysis/evidence/2026-10-11-composer-picker/model-picker-390.png)
- [Model picker, 530px viewport](../../analysis/evidence/2026-10-11-composer-picker/model-picker-530.png)
- [Permissions, 390px viewport](../../analysis/evidence/2026-10-11-composer-picker/permission-picker-390.png)

Final serialized `pnpm test:inventory` completed successfully (1,379 discovered files). After the isolated browser regression and mocked capability tests passed, the only remaining broad gate is exact-head GitHub CI on the new pull request.

### Native Traits implementation acceptance (2026-10-11)

Source-validated protocols:

- Codex App Server v2 uses `model/list` metadata for `supportedReasoningEfforts`, `defaultReasoningEffort`, `serviceTiers` and `defaultServiceTier`. Explicit selections are forwarded to `turn/start.effort` and `turn/start.serviceTierForTurn`.
- The installed `@anthropic-ai/claude-agent-sdk` models report `supportsEffort` / `supportedEffortLevels`. The native query takes an explicit `Options.effort` only when selected.
- Current `LocalAgentModelSchema` and strict native-only Assistant runtime message contract carry the discovered capabilities and explicit values, without exposing arbitrary executable arguments or credentials.
- Before inference, the Desktop host re-resolves the owning connection for the current identity and probes the Agent again. Unknown model, unsupported effort or service tier fails closed. Web/Mastra requests containing `nativeModelOptions` are rejected at the contract boundary.
- Traits are hidden on Mastra, Pi, DSH and any native model lacking executable capability descriptors. Default native settings do not send an explicit effort/tier. Explicit selections are in-memory per connection+model, and stale values are rejected after a model catalog change.

Checks on the isolated follow-up patch:

- Native driver and host-runtime tests: **24/24 passed** (includes catalog parsing, explicit Codex/Claude forwarding and rejected unsupported parameters).
- Schema contracts: **8/8 passed** (includes native-only and strict payload validation).
- Vue Composer/lifecycle: **22/22 passed**; session + dispatch surface: **30/30 passed** (includes native message options and Mastra payload isolation).
- Real Web/API/PostgreSQL/Chromium onboarding: **2/2 P0 passed**; 1 external opt-in skipped; temporary database was dropped after use.
- Updated Shell visual regression baselines verified **8/8** across Web/Desktop, including dark/light and narrow screen layouts, after model Traits concealment for Web/Mastra.
- `contracts`, `ai`, `app-vue`, `desktop`, `web` typechecks passed with all 32 required task dependencies; scoped ESLint and Prettier passed.
- Live signed-in native Codex/Claude execution was **not** performed on end-user Desktop; deterministic fake App Server / Agent SDK tests instead validate the exact supported native protocol fields. Full exact-head GitHub CI remains the gate before merge or deployment.
