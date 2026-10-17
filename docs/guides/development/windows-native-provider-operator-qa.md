---
tags: [development, acceptance, desktop, ai]
created: 2026-10-17T00:00:00Z
updated: 2026-10-17T00:00:00Z
description: Exact-binary Windows Native Provider acceptance without modifying daily profiles or silently spending credits
---

# Windows installed Native Provider operator acceptance

**Release gate:** These commands gather evidence for #454/#456/#457, not release approval. An installed exact-source candidate is required. A CI fixture, an unsigned NSIS test installer, and a live user account are **different** evidence types and must not be conflated.

## Immutable provenance

MEMOFLOW_PACKAGED_EXECUTABLE must identify an **actually installed** memoflow.exe in an isolated QA installation, not a development Electron executable or the daily user's older installation. Verify its source against the candidate installer/update receipt independently, and record source SHA, executable SHA-256, actual version, signing status, and Playwright result.

Both operator tests fail closed if the expected SHA-256 or version differs from the running executable. Neither test creates a tag nor deploys.

## Default Windows CI: no inference

Desktop Update Installed E2E runs the existing installed NSIS AGY offline Composer fixture and the new native-codex-unconfigured-installed.spec.mts. The latter uses a fresh, empty Codex Home and MemoFlow Profile, proving passive Codex discovery cannot fabricate an authenticated account/model catalog or persist a Native Connection. It never sends a model request.

## Explicit, read-only operator Codex acceptance

With operator consent to **read an existing Windows Codex login**, start PowerShell from the trusted source checkout matching that candidate and configure these process-only variables:

```powershell
$env:MEMOFLOW_PACKAGED_EXECUTABLE = 'C:\Path\To\QA\memoflow.exe'
$env:MEMOFLOW_QA_EXPECTED_EXE_SHA256 = '<64-char SHA256 from the independent installed-update receipt>'
if ((Get-FileHash -Algorithm SHA256 -LiteralPath $env:MEMOFLOW_PACKAGED_EXECUTABLE).Hash.ToLowerInvariant() -ne $env:MEMOFLOW_QA_EXPECTED_EXE_SHA256) { throw 'Installed executable differs from the verified updater receipt' }
$env:MEMOFLOW_QA_EXPECTED_VERSION = '0.20.1' # Set to the candidate's independently verified version
$env:MEMOFLOW_QA_CODEX_EXECUTABLE = 'D:\scoop\shims\codex.exe' # Check the installed Windows CLI first
$env:MEMOFLOW_QA_CODEX_HOME = 'C:\Path\To\ApprovedExistingCodexHome'
$env:MEMOFLOW_RUN_NATIVE_CODEX_QA = 'CONFIRM_READ_ONLY_ACCOUNT_PROBE'
pnpm --dir apps/desktop exec playwright test e2e/native-codex-account-operator.spec.mts --config playwright.config.ts --workers=1
```

The test creates only a temporary **MemoFlow user profile**, does not copy or log Codex Home, and sends **zero** paid requests. It verifies actual Windows account/read and model/list, explicit model selection materializing one Native Connection, and A → empty Home B → A account-state isolation. Log only model counts, boolean readiness and binary provenance, never emails, plan, model names, home paths, tokens or auth files.

Without the opt-in variable, the operator test skips and will not access the real login.

## Separately authorized DSH live Send

live-dsh-operator.spec.mts now supports installed executable hash/version provenance and uses the **installed** app's preload, not a development-only preload. A real Send still requires a suitable Windows DSH launcher and separate explicit permission for one paid request, signified by MEMOFLOW_RUN_LIVE_DSH_QA=CONFIRM_ONE_PAID_REQUEST. The default always skips. No repeated paid inference or automatic retries.

429 and quota-failure tests use **synthetic offline injection**, never a manufactured upstream rate-limit. Do not exhaust credits for validation.

## Closure and release freeze

A green operator test is one receipt, not a blanket #454/#456/#457 closure. Reconcile exact SHA, installer binary hash, signing status, account/Profile isolation, true provider status, and failure recovery in the established acceptance/final audit document inside a substantive PR. Leave all release workflows disabled until every remaining feature and release acceptance gate has passed.
