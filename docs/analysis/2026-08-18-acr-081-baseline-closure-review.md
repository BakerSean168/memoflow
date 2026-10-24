# ACR-081 — Baseline convergence + ADR-049 closure evidence

> Date: 2026-08-18
> Branch: `refactor/acr-081-closure`
> Base: `0f0e5b06` (main, after PR #241)
> Scope: converge failure-contract baseline to the single registered internal surface; mark ADR-049 implemented.
> Implementing agent (baseline edit): opencode-go/deepseek-v4-flash.

## 1. Baseline convergence (163 → 1)

`tools/governance/failure-contract-baseline.json` converged from 163 historical registrations to a
single entry:

```json
{
  "ruleId": "UI_RAW_RESULT_MESSAGE",
  "file": "apps/desktop/src/renderer/main.ts",
  "snippet": "error.message",
  "owner": "desktop-error-boundary",
  "kind": "permitted",
  "reason": "Internal developer surface: error-boundary crash formatting (formatError) ... NOT a public operation failure; deliberately retained.",
  "status": "permanent"
}
```

- removed `retireBy` (scanner only expires entries WITH retireBy, so the entry is now permanent).
- 163 stale entries (whose findings were already eliminated) removed.
- **Audit: 1 current finding, 0 stale, `passed`** — the perpetual "N stale baseline entries can be
  removed" warning is gone.

## 2. Fail-closed intact

Scanner scatter rules in `failure-contract-inventory.mjs` untouched. Any NEW production finding
produces a fingerprint absent from the 1-entry baseline → `evaluateFailureContractInventory.newFindings`
non-empty → audit exits 1. Unit test suite (9 tests) still passes, including new-finding failures.

## 3. ADR-049 plan status → implemented

Plan `docs/plan/active/2026-08-17-application-contract-and-architecture-refactor.md` is marked
**implemented** with completion evidence referenced
(`docs/analysis/2026-08-18-adr-049-completion-evidence.md`).

## 4. Validation

- `node tools/governance/failure-contract-inventory-audit.mjs` → `1 current finding; 0 stale; passed`.
- `failure-contract-inventory.test.mjs` → 9 passed.
- No new findings across any rule.

## 5. Gate

ACR-081 baseline convergence + ADR-049 closure evidence complete. (The fail-closed governance
freeze of all remaining report-only rules and the plan archival are the final ACR-081 tail,
tracked separately.)
