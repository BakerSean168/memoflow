---
tags: [plan, ai, byoa, desktop, release]
status: in-progress
created: 2026-10-17T06:00:00Z
updated: 2026-10-17T06:00:00Z
description: Close existing Native AI validation, add Google Antigravity through official ACP, then release the verified candidate.
---

# Antigravity BYOA and release closeout

## Baseline and scope

PR #468 is merged as `202b1304fe218cb5d50109460c4d3c2d0099c5b2`. Its exact-head CI passed 19/19; Windows NSIS and Linux AppImage update workflow #39005892025 passed, including Windows Workspace IPC 4/4 and a cleared, candidate-verified installer receipt. Deterministic 429/quota injection is accepted failure-behavior evidence; deliberately exhausting a provider is not a release gate.

Add **Google Antigravity (AGY)** as a Desktop Native Agent, not a Mastra model service and not an OAuth/API proxy. Web remains Mastra-only. Preserve all existing user profiles, credentials, conversations, native runtime grants and release provenance. Use ChatGPT as the implementation/review owner; no second writer.

## Verified protocol / architecture

- Official registry: `agentclientprotocol/registry/antigravity-acp/agent.json`, Google LLC, release 1.4.0 at inspection; native commands `agy_acp_server.par` (Linux/macOS), `agy_acp_server.exe` (Windows), Linux argv `--uid=`. Do not bundle or relicense the proprietary executable.
- `agy` CLI and Antigravity ACP are different programs. The existing installed official ACP server handshake advertises MCP HTTP, `session/resume`, config options and model directory; `authenticate(methodId=oauth-personal)` loads native cached login before `session/new`.
- Read-only probe with an existing, operator-owned native Home successfully discovered three currently authorized Flash model IDs without inference. No credential contents were read or copied by the diagnostic.
- Reuse the native JSON-RPC transport and shared ACP lifecycle currently used by DSH. Extend the actual runtime factory, Registry, persisted Connection mapping, Settings, Composer and icon metadata; never create a second conversation/retry/storage authority.
- Antigravity native `GEMINI_HOME` is explicit `homePath` or native default. Native OAuth is owned by the official executable; no token DTO, key form, token extraction, or third-party backend calls. Missing login must be a safe login-required state, not an automatic browser or paid probe.
- Discover model IDs from ACP config options (with standard session models as fallback). Preserve actual selected model, session identity, cancellation and permission requests. Antigravity interaction questions must not become auto-approved permissions.

## Execution sequence

1. Contract/metadata: add `antigravity`, canonical default executable, stable Driver ordering after DSH and before Mastra, Settings and Composer, verified icon provenance. Unit/contract tests first.
2. ACP vertical slice: share DSH transport lifecycle, introduce Antigravity-specific launch/auth/native-home handling, safe status/version/account-context, model discovery/selection, resume, permission/questions and stop. Preserve existing DSH tests.
3. Validation: isolated raw native handshake; contract/AI/Vue regression; real Windows Electron synthetic positive/negative ACP cases and official packaged UI/installer checks; at most a short controlled Flash success test when the native account is already usable. Synthetic failures and real inference are distinct evidence.
4. Closeout: update current acceptance index/receipts, independently review changes, exact-head CI, standard PR merge. Do not close #454/#456/#457 merely because AGY is registered or a unit test passes.
5. Release: follow `docs/guides/development/release-workflow.md`, including required prod-like checks, Prepare Release, protected release PR, exact-SHA CI, immutable Desktop and Docker release artifacts. Publish only after all required evidence succeeds; production server rollout is separate.

## Acceptance

- Default AGY is visible and correctly typed on Desktop; no runtime or UI entry leaks to Web.
- Missing executable, login-required, model unsupported, 429/quota, cancellation and unknown errors fail safely without raw diagnostics or automatic inference retries.
- Settings and Composer use the same saved Connection identity; selection is explicit, model preferences remain identity/instance/model scoped, and changing Native Home cannot resume the old account's conversation.
- Actual official Agent can discover models and use the existing Desktop Send/events/history path. Permission and user-input responses remain request-scoped and expired requests cannot be resurrected.
- UI retains stable one-line Provider rows, left-only enable control, deterministic ordering, six-Agent icon consistency, and existing pane-scoped Goal/Task/Routine/Schedule behavior.
- Final receipt names tested code SHA, test layer, counts and release artifacts. No unpublished or unverified binary is described as released.

## Identity refinement from real native discovery

Two actual prompt-free ACP probes succeeded but revealed that native authentication rewrites the cache. File metadata is therefore not a stable identity. The existing native-identity boundary now performs bounded local parsing of the AGY cache and derives a one-way digest from stable client/refresh authorization fields and auth configuration. Raw credentials are never returned, logged, copied, synchronized or used for a model proxy. Cache formatting/access-token refresh does not change the partition; replacement authorization does. The official executable remains the OAuth/inference owner.

## Implementation checkpoint

- Native ACP support is shared by DSH and Antigravity through `AcpDriver`; the old DSH-only implementation is replaced, not wrapped.
- AGY is connected through contract/Registry/native Connection/Settings/Composer, with six-Agent stable ordering, licensed normalized SVG identity, explicit official-runtime/Home guidance, and unchanged Web Mastra-only behavior.
- The targeted native/Registry suite passes 100/100 after adding Agent auth, model, session, permission/question, failure and identity regressions. Earlier contract RED reproduced the missing driver before implementation.
- A single operator-controlled real `gemini-3.8-flash-low` request through MemoFlow `LocalAgentRuntime` and the real SQLite repository produced `assistant.run.started -> assistant.message.delta -> assistant.run.completed`; 2-character response, zero permission requests, matching streamed/completed/persisted Assistant content, both message roles stored, `incomplete=false`. A subsequent same-session ACP resume handshake succeeded and was closed before sending any additional prompt. This is GCP native runtime evidence, not Windows installed-client proof.
- Windows automated acceptance adds a full AGY Composer send/restart test and six DSH/AGY offline error cases. These use disposable native Homes and synthetic ACP, never real Google credentials or inference. Exact-built Windows execution and the final pipeline remain the next gates.

## Exact-candidate Windows and native closeout

Product source `abb597e3162503ed207c26e05d96141cc7be664c` built successfully, and the compiled Desktop main SHA-256 `980135dcc145385195ff97cfb2b3f6e40eeea186d073e46c1c1714cae8af06e1` matched in the isolated Windows environment. Canonical Workspace IPC plus six DSH/AGY failure scenarios and the AGY Composer/history/restart journey passed **8/8**, zero skipped/unexpected/flaky.

A separate operator-run, unbilled Windows Codex case passed: 7 native models, explicit selection materializing one saved Connection, persistent model-visibility preference after restart, Native Home A -> empty B -> A with no prior authentication displayed in B and stable restored model context after explicit recheck. Browsing a category alone intentionally stays read-only; rechecking after configuration save is explicit. The native handshake supplied no parseable CLI version, so no version was fabricated. Same-candidate Windows DSH Flash completed one short genuine request, stored matching user/assistant content, and used no tools/retries. Daily application data and original QA program were preserved/restored.

The installed-update workflow now additionally reuses the AGY Composer test against the **actual NSIS-installed executable** from the verified updater receipt, checks `app.isPackaged` and the exact executable path, and uploads independent runtime-provenance evidence. This test uses offline ACP, not a Google account. Full final-SHA CI, prod-like and installed-candidate results remain required before publication.

## Final validation repair pass

The preliminary all-affected run passed lint and built healthy prod-like services, but did not pass its final gate. It caught a redundant native-only template comparison (Vue TS2367), and an existing notification factory surface fixture implicitly requiring unsupported Push/Desktop channels under a development environment. The template comparison is removed; the factory test now explicitly supplies its real InApp-only capability. Production fail-fast behavior is unchanged. The notification fixture was reproduced RED under `NODE_ENV=development`, then GREEN 7/7 after correction; its normal full suite previously passed 233/233.

The preliminary run also detected source revision drift while final tests were being added. Its mixed-SHA report is retained as a failed intermediate result and cannot authorize publication. The final run freezes one committed source SHA through engineering, container provenance, browser acceptance, and installation tests.

## Official ACP download entry (T3 Code UX reference)

MemoFlow Desktop now offers the **official Google versioned ZIP download link** in both the Antigravity Provider detail and the Add Agent wizard, plus a link to the canonical ACP Registry for new releases and other platforms. The Windows x64 entry is pinned to registry `antigravity-acp` **v1.4.0** (`https://dl.google.com/agy-extensions/releases/windows/agy-acp-server-1.4.0-windows-x86_64.zip`), verified to respond HTTP 200 and match the upstream registry. The download is explicitly initiated through the existing safe `SystemChannels.OPEN_EXTERNAL_URL` desktop IPC; it is **not** an installer, does not run any downloaded binary, update a profile, or perform OAuth. The user extracts the server and bundled harness together and selects the executable path. Proprietary Google binaries are never committed or bundled by MemoFlow.

T3 Code reference: `ProviderSetupSection.tsx` and `AntigravityInstallation.ts` at `pingdotgg/t3code@2fbd4318` implement a separate managed-installer lifecycle. MemoFlow intentionally does not create an ad-hoc second installation owner inside the BYOA Agent runtime. If managed installs become a product requirement, they need their own version, signature/size, cancellation, cleanup and lifecycle contract rather than repurposing the Provider connection record.

The follow-up also repairs the Windows installed-updater → AGY Composer workflow to read its actual `desktop-update-installed-e2e.json` receipt instead of the nonexistent `windows-installed-update-report.json` and adds the missing `handleSendChat` method to the isolated test Session mock. The runtime/native Send implementation is unchanged; full affected tests and Windows CI remain the authoritative acceptance gates.
