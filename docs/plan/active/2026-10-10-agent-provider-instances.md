---
tags: [plan, ai, providers]
description: Shared Agent instance settings implementation and verification.
created: 2026-10-10T00:00:00Z
updated: 2026-10-10T00:00:00Z
---

# Agent provider instances

Implement a shared Vue list/detail surface with Mastra as the Web driver and Desktop-only Codex, Claude Code, Pi and DSH slots. Translate T3 default synthesis and Agent → Identity → Config behavior without introducing another execution runtime.

## Guardrails

- Model connections remain AI owner records backed by existing SecretVault onboarding and identity-bound replacement. Their IDs, defaults, verified models and conversation history stay intact.
- Desktop native connections remain profile-scoped SQLite records. Optional immutable instance slugs and accent metadata extend JSON records without invalidating old saved connections. Uniqueness and revision checks happen inside repository transactions. Session fingerprints continue to bind executable/home/driver.
- Default native slots are presentation projections, not evidence of installation or login. Listing and saving never probe or infer. Status is unknown until an explicit check.
- No credentials enter instance metadata, browser storage, command lines or logs. Web has no native transport.
- Credential-free durable Mastra draft creation is deferred: the existing AI connection API requires verified credentials. Show a default unconfigured Mastra and explain that additional Mastra instances are saved only after verified model configuration; never show fake save success.

## Implementation

1. Extend local identity contract and owner repository with immutable unique slugs; test owner isolation, conflicts and existing records.
2. Add shared Agent wizard, synthesize default entries, keep model services within Mastra configuration, and select saved native details.
3. Update Vue and Web E2E expectations while retaining secret assertions. Run focused tests, typechecks and lint; record exact limitations and failures.

## Implemented slice and remaining work

The shared Vue surface now shows a default unconfigured Mastra on Web and four installation-independent native slots on Desktop. The add dialog has Agent → Identity → Config stages; model API services appear only in Mastra configuration. Native instances are saved through the existing IPC/runtime/repository, selected in the right detail, and support executable/home edits, explicit status checks, models and existing write scopes. Native slugs are validated, unique per owner and immutable once assigned; old UUID identities and JSON records remain valid. Optional accent colors persist and appear in the list. Configuration survives backward wizard navigation. Existing model onboarding, replacement and conversation/runtime defaults remain on their original backing services.

These items are **not implemented** and are required for full product acceptance:

- A durable Mastra instance registry independent of verified model-service connections, including credential-free drafts. Additional Mastra entries currently project existing verified model connections one-to-one. The default unconfigured Mastra is synthesized; it is not a persisted draft and its presentation ID is replaced by the server connection UUID after configuration.
- User-editable human-readable Mastra IDs and Mastra accent metadata. Configured Mastra entries retain their existing server UUIDs and editable names; native instances support immutable human-readable slugs.
- Completing an unsaved Mastra draft in the right detail after creation. The default right detail starts the existing SecretVault onboarding dialog; the add wizard likewise proceeds to credential/model verification before a record exists.
- Native installation/login status for unsaved default slots. Their status is explicitly “not checked”; save the connection and use the explicit check to observe not_installed, login_required, unavailable or ready. Listing and creation never start an executable.

A driver's implicit default slot is suppressed only when a matching default-slug connection (`driver` / `driver-default`) or a legacy un-slugged connection exists. Additional named instances (such as `codex-work`) do not hide that default. Removing the default connection reveals its implicit slot again. No schema migration or credentials were added to local records.

## Verification evidence (2026-10-10)

- `pnpm nx run app-vue:test -- --run src/modules/setting/components/AISettings.spec.ts src/modules/setting/components/AISettings.provider-onboarding-v2.surface.spec.ts src/locales/i18n-key-completeness.spec.ts`: **36 tests passed**. Covers Web capability isolation, default entries, native slot retention after adding another instance, wizard validation/navigation, list/detail selection, save failures, revision forwarding, explicit native status cases, and opaque credential onboarding surface protections.
- `pnpm nx run ai:test` filtered to local-agent repository, provider-secret-vault contract, connection probe and onboarding commit: **15 tests passed**, including real SQLite owner isolation, slug conflict/immutability, revision locking and legacy record preservation.
- `pnpm nx run ai:test` filtered to replacement probe/commit, local-agent runtime and native identity: **14 tests passed**.
- `pnpm nx run contracts:test` filtered to local-agent DTO and provider-onboarding DTO: **12 tests passed**.
- `pnpm nx run desktop:test` filtered to local-agent writes and portability: **2 tests passed**.
- `pnpm nx run-many --targets=typecheck --projects=contracts,ai,app-vue,desktop`: **passed**, including dependency builds. A subsequent source-only app-vue typecheck also passed.
- Targeted ESLint on changed Vue, TS, locale and E2E files: **passed**. `git diff --check`: **passed**.
- `pnpm nx run memoflow:governance-check`: **passed**.

The first Vue runs failed because old creation assertions submitted the underlying detail instead of the new dialog and the test DialogContent stub rendered closed dialogs. Assertions now address the wizard, and closed dialogs no longer mount their content. No outstanding failure remains in the checks listed above.

Web Playwright expectations now exercise Mastra Agent selection before Custom service configuration and retain atomic-save/replacement, encrypted-key rotation, masked-secret, functional selector and disabled-provider assertions. Full browser E2E was not run: its harness provisions an API/test database and reads environment files. Only test discovery is used here. No real provider inference, API credentials, native CLI installation/login, deployment, push or commit was performed. Packaged Desktop/native process smoke is unverified.

This is a reviewable, committable vertical slice, **not completion of the full Mastra draft product contract**. Changes remain uncommitted on the dedicated branch.
