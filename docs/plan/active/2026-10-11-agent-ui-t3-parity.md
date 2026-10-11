---
tags: [plan, ai, ui, providers, t3-code]
description: Fix the five reported Agent settings/composer usability regressions against T3 Code's concrete UI and lifecycle.
created: 2026-10-11T00:00:00Z
updated: 2026-10-11T00:00:00Z
---

# Agent settings and composer: T3 UI parity

Base: main `9dc3b72227d` (0.18.0). Dedicated worktree `memoflow-agent-ui-parity`, branch `fix/agent-settings-t3-parity`. Existing account, SecretVault, provider connection, native UUID and conversation data must remain unchanged. No Codex execution or paid inference for implementation/verification.

## Reported issues and root causes

1. Web composer combines Agent identity into the model list and mounts the Agent picker only when a Desktop local client exists. No Web permission control. Separate Agent / selected Agent's model / supported permission mode controls are required on both hosts.
2. Agent wizard uses plain numbered text, stacked full-width fields and nested detail forms with separate footers. Reproduce T3's segmented progress, selected Driver cards, label/help + compact control rows, consistent body height and one navigation footer. Keep keyboard semantics and unique field IDs.
3. Mastra embeds an entire legacy model-vendor onboarding wizard. Remove the vendor picker and secondary modal from product UI. Show editable Endpoint (URL including optional port) and secret API Key directly on the selected Agent's right panel, with inline model discovery/verification/save. Reuse safe custom OpenAI-compatible endpoint policy and SecretVault; never store plaintext or bypass model verification.
4. Default and implicit instances are conditionally excluded from enable switches. Every list row and selected details header must offer the same enable/disable operation, materializing implicit configuration with Revision 0 only when the user changes it. Saved native connections remain owned by the native repository.
5. Settings and persistent chat use separate provider refs; chat loads its Registry only on mount. Introduce an app-scoped AI configuration invalidation signal (no credential payload), refresh consumer state on successful mutations/route reactivation, discard stale requests and fail closed. Do not fix this with page reload or a global singleton/event bus.

## Implementation contract

- Inspect T3 `AddProviderInstanceDialog`, `WizardSteps`/`SettingsRow`, composer Provider/model controls and per-thread permission modes; adapt to Vue/host capabilities instead of adding remote environments.
- Keep creation independent of installation/authentication. Web Driver allowlist stays Mastra-only. Explicitly selected native instances and Mastra instances remain distinct and do not silently fall back.
- Endpoint and key editing happens after instance creation. Existing vendor-specific records stay usable; new entries use the generic compatible connection. Remove visual vendor cards/catalog form, not arbitrary saved connections or keys.
- Permission UI must change real host behavior. Defaults stay supervised; supported modes are capability-specific, never widen authenticated owner scopes. Unsupported provider modes must not appear as working options.
- Agent selection and model selection are independent; changing Agent selects only a model belonging to that Agent or leaves it unconfigured. Bound conversations preserve Agent identity or explicitly start a new conversation.
- Client models are ephemeral catalogs, not a new credential/config authority. Model enablement/default selection must be enforced by Registry + ModelResolver, not just UI.

## Acceptance (one bounded delivery, no extra feature phases)

- [x] Shared composer renders three separate controls on Web and Desktop; Agent change scopes model menu, permissions are enforced and default-safe.
- [x] Wizard matches T3 structure: selected cards, segmented/back-navigable steps, compact settings rows, one footer; no vendor choice in any step.
- [x] Right-panel Endpoint/API Key form works without a model-service modal and preserves SecretVault/model verification.
- [x] All default/saved/implicit Agent switches exist, persist/reload, and show disabled state correctly.
- [x] Configure/enable/replace/disable in Settings then return to the mounted Chat updates Agent/model availability without refresh, including late requests and failures.
- [x] Targeted contract/runtime/UI tests, lint/typecheck, real browser interactions at 1440 and 390 widths and relevant security regressions pass.
- [x] Record exact commit/test/browser results and remaining limitations; do not claim published unless the candidate is actually deployed.

## Implemented details and evidence

T3 reference: `cfbd1457ad093b1cd7f6c53851009a62b676b203`, inspected `AddProviderInstanceDialog.tsx`, `AddProviderInstanceWizardSteps.tsx`, composer selectors and native permission documentation. This patch adapts structure and behavior to MemoFlow's Vue/shared host architecture; it does not import T3's remote development architecture or equate all runtimes' capabilities.

- `AIComposerControls.vue` replaces the native-only picker with three always-present Agent / model / permissions controls. Unconfigured Agents remain selectable; choosing one does not silently select another Agent. Mastra supports supervised/read-only, Native supports supervised/explicit per-turn auto-approve. Runtime and tool guards enforce these choices; Native questions still require an answer and business write scopes/sandbox rules do not expand.
- `AgentInstanceWizard.vue` uses segmented steps, Agent icons and cards, compact property rows, unique field IDs, and one consistent footer. Invalid/duplicate identities block Continue. Save creates an instance independently of installation and authentication.
- `MastraAgentSettings.vue` provides Endpoint, API Key and model selection directly in the right panel. The second supplier modal and vendor cards are removed. Existing provider adapters/opaque credentials are retained solely for backward compatibility. Secure custom-compatible onboarding, expiry, owner binding, SSRF checks and replacement are reused. Raw keys are cleared after probing and on unmount. A successful credential commit with a failed model binding can be retried without duplicating its provider connection.
- All instances, including implicit/default Mastra and native entries, have both list and detail enable/disable switches through Registry Revision/CAS. Native configuration remains owned by the legacy native repository; no duplicate runtime identity is introduced.
- The app-scoped configuration epoch is payload-free and instantiated separately for Web/Desktop; it refreshes active Chat refs, the Registry and native choices. Generation/disposal checks drop stale responses. Settings reload/deep-link Return now stays in SPA routing rather than traversing unknown browser-document history.
- Model inventory stays a read-only live catalogue, not persisted Provider configuration. Registry authorizes the bound connection; ModelResolver validates exact model membership/capabilities before execution. Changing an instance's default model uses host live validation and fences the Provider version in the write transaction without changing a shared Provider default.

### Validation (GCP isolated worktree, 2026-10-11)

| Evidence                                                                                              | Actual result                   |
| ----------------------------------------------------------------------------------------------------- | ------------------------------- |
| Vue Settings, composer, model choices, app invalidation, session modes, route return and locale tests | 120/120, 10 files               |
| AI Registry, native runtime, tool-policy, Mastra workflow, ModelResolver and HTTP runtime tests       | 110/110, 6 files                |
| Runtime and instance contract tests                                                                   | 22/22, 2 files                  |
| Contracts / AI / App Vue / API / Desktop typecheck and required builds                                | 5 targets passed                |
| Changed TypeScript / Vue ESLint                                                                       | passed, no reported diagnostics |
| Real Web/API/PostgreSQL/SecretVault browser P0                                                        | 2/2 passed                      |

Browser assertions cover empty Agent save/reload, direct HTTPS fixture Endpoint/Key verify, repeated credential replacement, a separate instance default without a shared provider-default mutation, mandatory owner/native-driver/CAS rejection, all three composer controls, switching within a live model catalogue, read-only mode, default/native switches, and 1600/1280/390 pixel responsive layouts. A `window` marker proves Settings Return preserved the same browser document; the first run detected and reproduced the browser-back reload bug before the fix.

Screenshots are actual Playwright-rendered application output, not design mockups. Only synthetic test account/model fixtures are used; no live user credentials appear:

- [Composer: Agent, model, permissions](../../analysis/evidence/2026-10-11-agent-ui-parity/composer-three-controls.png)
- [Agent selection](../../analysis/evidence/2026-10-11-agent-ui-parity/agent-wizard-1.png)
- [Identity form](../../analysis/evidence/2026-10-11-agent-ui-parity/agent-wizard-2.png)
- [Direct connection details](../../analysis/evidence/2026-10-11-agent-ui-parity/providers-dark-1600.png)
- [Narrow-width details](../../analysis/evidence/2026-10-11-agent-ui-parity/providers-dark-390.png)

### Boundaries and deployment

No production/staging records, existing API keys, old Agent instances, database schema or lockfile are migrated/deleted by this patch. Browser verification uses a uniquely named test database and HTTPS provider fixture, not paid commercial inference. Windows packaged UI/native authenticated runtime and real commercial model inference were not executed in this change. The Desktop packaging smoke spec was updated to the new shared wizard; a spec update is not a packaged-run pass.

Source changes require a new PR and exact-head CI before canonical Staging update. These screenshots are isolated-browser evidence, not a claim that existing Staging already serves this revision. Publish/merge state must be verified from GitHub and deployment state rather than inferred from this document.

### PR #445 CI repair after initial exact-head run (2026-10-11)

Initial PR CI `38071207008` at `a904b8320bd` failed for three primary reasons; downstream Oracle and Delivery jobs reported these underlying failures. Repairs preserve the T3-inspired three-control UI and verification semantics rather than ignoring tests:

1. **Settings component contract:** the shared presentation spec still required `SettingsDialogShell` and onboarding commits inside the root `AISettings.vue`, but these owners were intentionally split into `AgentInstanceWizard.vue` and `MastraAgentSettings.vue`. Update the spec to assert actual component ownership; render shared `SettingsStatusBlock` for root loading/errors to retain semantic status and accessibility. Targeted Vue tests: **27/27 passed**.
2. **Agent default-model save race:** the browser assertion read the persisted model binding immediately after clicking Save, while the selector already displayed the draft. The UI now resets stale save acknowledgements on model changes and marks actual completed saves; the browser waits for successful completion before reading the Registry. Dedicated Web/API/PostgreSQL/SecretVault P0 tests: **2/2 passed** in a uniquely named ephemeral PostgreSQL database; test DB dropped after completion. The shared test database was _not_ migrated or subjected to `--accept-data-loss`.
3. **Expected visual change:** the four canonical Shell screenshots contained the former single-model composer, while the new UI intentionally shows Agent, scoped model and permission controls. Compared before/after captures and updated only those four baselines, then ran the visual matrix in non-update mode: **8/8 Web/Desktop passed**. No visual test was suppressed or relaxed.

ESLint, Prettier and `git diff --check` pass for the modified TypeScript/Vue/test files. Earlier baseline local/CI validation remains documented above; the exact-head CI for the repair commit must be checked separately. `main` was advanced without loss from `68398e60fc4` to the remote release `9dc3b72227d` in the separate canonical worktree only after archiving its old uncommitted BYOA/Provider draft under local tag `archive-main-wip-20261011`, a stash, and machine-private diff/tar backups. The archived draft has **not** been folded into this PR.

### Follow-up CI Integration Oracle fixture repair (2026-10-11)

The exact-head CI run 38106339418 for cd2c03c88b3 cleared the prior unit-test, typecheck/build, Governance and Web Flow Shards 1/2/4 failures. The remaining independent Integration Oracle failure is a real Prisma query against **an isolated manually created integration fixture database**, not the deployed or canonical test schema. The Agent Registry integration test modeled ai_provider_configs without its existing version INTEGER NOT NULL DEFAULT 1 field, but the Repository reads that version to fence a concurrent model-binding save. Add the missing production-schema baseline column to the fixture; do not weaken the version-checked Repository or disable the test. The same test now passes **1/1** with real PostgreSQL, Prisma transactions, Owner/CAS and conversation claims using a newly provisioned temporary test database (removed on completion). No shared/Staging data was changed.

The final CI for the additional fixture repair commit must pass before declaring this PR green or merging it.

### PR #445 Web Flow Shard 1: preserve composer drafts during slow initialization (2026-10-11)

Exact-head CI `38107064544` failed the 80-delta streaming performance case **before streaming**: Playwright filled the composer, but the send button remained disabled. The preserved trace showed the Agent Registry returning while the page was still fetching Providers/conversations; the failure screenshot showed the model selected but the composer draft empty. The root cause was the late `resetChatSession('chat')` inside `initializeChatView()`, which ran only _after_ `localChoices.refresh()` and `loadAgentRegistry()` completed and cleared input typed during those awaits.

- Reset the initial session **synchronously at the start of** the `useAIChatView` mount callback, before any request or await. Remove the redundant reset from `initializeChatView()`. Ordinary explicit new-conversation actions still reset the composer as intended.
- Extend the Mastra Registry E2E fixture to optionally hold its GET response until the test releases it. New browser regression types a draft while the Registry is deliberately pending, releases the request, asserts the draft remains unchanged, and sends the exact text through the real Web/API runtime path.
- Mock the actual `POST /ai/providers/:id/refresh-models` response in the multi-engine E2E fixture, replacing an unrelated 404 during setup with an explicit model catalog. Neither the production runtime's model discovery nor its fail-closed provider/owner enforcement was bypassed.

Local validation: **22/22 Vue selection/lifecycle unit tests passed**, **3/3 real Chromium Web/API browser checks passed**, including the previously failing 80-delta benchmark and the newly added deliberate slow-Registry regression, in a uniquely named temporary PostgreSQL database subsequently dropped. `app-vue:typecheck` and `web:typecheck` and required builds passed, as did changed-file ESLint/Prettier/diff checks. Full GitHub exact-head CI for the new commit is the remaining merge gate; no Staging or production deployment in this remediation.
