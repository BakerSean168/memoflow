---
tags: [plan, ai, providers, ui]
description: Provider loading, built-in reset, and capability-aware composer repair.
created: 2026-10-11T00:00:00Z
updated: 2026-10-11T00:00:00Z
---

# Provider settings / Composer repair

1. Reproduce host-dev settings error through authenticated browser and inspect owning HTTP/database path. Compare T3 reference source and live UI.
2. Isolate settings refresh failures, retain successfully loaded instance/config sections and expose retry.
3. Separate default reset from deletion: CAS update the built-in configuration without deleting identity, model connections, secrets or conversation bindings. Put reset/delete icons and real native runtime versions in detail headers.
4. Distinguish initial loading, globally unavailable providers, and a browsed provider with no models. Preserve picker geometry and localize setup actions. Show only adjustable, executed model/permission capabilities.
5. Run relevant runtime/UI tests, typecheck/lint and authenticated browser acceptance. Record observed results and limitations.

Default reset restores the built-in name, color, enabled flag and native paths/scopes; model-service bindings are user-owned and remain intact. Ordinary deletion retains existing conversation protection. No fabricated Mastra runtime version or reasoning options.

## Findings and implementation

- Host-dev PostgreSQL was missing all three Agent Registry tables. Applied the existing additive `packages/database/prisma/migrations/add-ai-agent-instance-registry.sql` and the existing preparation script. Existing provider and conversation counts stayed 2 / 2. No broad Prisma push or data-loss acceptance was used against Dev.
- A second, independent browser failure occurred before HTTP: the long-running bundled Vite client omitted the newly added `createAgentRegistryHttpClient` export. Reloading the Vite configuration regenerated that bundle. Verified authenticated Registry HTTP 200 and a visible, editable Dev settings page. Task-created Dev test users were cleaned up.
- Settings refresh now settles Registry, native connections and model-service requests independently. Successful sections and the last successfully loaded configuration remain visible on refresh errors; the existing recheck control provides recovery.
- `reset` is an explicit CAS command. Built-in instances reject `remove`, including after configuration has been persisted. Reset restores name/color/enabled and native executable/home/write scopes while retaining native identity, model-service bindings, secrets and conversation history. Ordinary deletion still protects conversation references. The reset tooltip explains retained connections/history.
- Reset/delete are icon actions in the detail header. Real `LocalAgentStatus.version` appears beside the native header actions; no Mastra version is fabricated. Header actions wrap on narrow screens, and status badges no longer collapse into vertical text.
- Composer waits for Registry, model catalogue and initialization before presenting global unavailability. With no usable model from an enabled instance, only the localized provider-settings action remains. A browsed empty instance keeps the fixed model-picker geometry and shows the localized provider-specific message/setup action.
- A completed empty live catalogue no longer fabricates the persisted default model. Pending catalogues preserve the selection until a real result arrives.
- Mastra reasoning remains hidden. Native reasoning needs more than one advertised effort; tier options remain tied to executable metadata. Permission controls require an enabled selected instance/model and at least two supported modes. Mastra supervised/read-only and native supervised/auto-approve are implemented by the existing runtime/tool guards.

## T3 comparison

Inspected the running T3 UI (`0.0.46-nightly.20261011.2955`) in a read-only paired browser session, including Providers and the resting Composer. Source reference checkout: `f769e01e28c80745621a699ed5ee021cc78039b6`, particularly `ProviderSettingsPanel.tsx`, `ProviderInstanceCard.tsx`, `ChatComposer.tsx`, `ModelPickerContent.tsx` and `composerProviderState.tsx`.

Confirmed default-only reset versus ordinary deletion, header version/action grouping, initial-catalogue suppression of unavailable chrome, stable model-picker geometry and capability-derived traits/runtime modes. MemoFlow retains its actual permission semantics rather than copying T3 permission labels.

## Validation

- `app-vue:test`: 62/62 targeted tests across Settings, Composer, selection, lifecycle and provider state.
- `ai:test`: 47/47 Registry/SQLite, local-runtime permission and ModelResolver tests.
- `contracts`, `ai`, `app-vue` typechecks and required package/API builds passed.
- Changed-file ESLint and `git diff --check` passed.
- `web:e2e:ai-provider`: 4 passed; one explicit opt-in commercial/live-provider test skipped. Uses a unique temporary PostgreSQL database, real API/SecretVault, Chromium and an HTTPS model fixture; the database is removed after the run.
- Browser checks cover add/persist/replace, reset/delete distinction, auxiliary-request failure without losing the editor, delayed Registry without empty-state flicker, global unavailable CTA navigation, per-instance empty text/stable dimensions, permissions, and light/dark layouts at 1600/1280/390px.
- Registered the additional browser spec in the existing secure-acceptance collector/ownership inventory. Governance check passed after regeneration.

No PR, merge, Staging/production deployment or real commercial inference is part of this change. Native packaged UI was not run on Windows/macOS; native persistence and permission semantics were exercised by runtime tests.

Actual fixture screenshots: [390px settings](../../analysis/evidence/2026-10-11-provider-composer-repair/providers-dark-390.png), [390px model picker](../../analysis/evidence/2026-10-11-provider-composer-repair/model-picker-390.png), [unavailable-provider control](../../analysis/evidence/2026-10-11-provider-composer-repair/empty-providers.png).
