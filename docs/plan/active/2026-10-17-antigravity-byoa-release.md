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
