# ACR-071 — Tailscale MagicDNS local-validation HTTP exemption Review Evidence

> Date: 2026-08-18
> Branch: `refactor/acr-071-magicdns-local-validation`
> Base: `151e6aec` (main, after PR #242 ADR-049 closure)
> Scope: allow Tailscale MagicDNS http hosts when LOCAL_VALIDATION=1 in production env validation.
> Implementing agent: opencode-go/deepseek-v4-flash.

## 1. Change

`apps/api/src/shared/infrastructure/config/env.schema.ts`:

- New module-scope helper `isControlledMagicDnsHost(hostname)` → true for `.ts.net` suffix
  (Tailscale MagicDNS reserved domain).
- `trustedHttp = loopbackHttp || (env.LOCAL_VALIDATION && isControlledMagicDnsHost(url.hostname))`
- HTTPS-required check now passes when `trustedHttp` (loopback OR MagicDNS host) with
  `LOCAL_VALIDATION=1`.

Gated on `LOCAL_VALIDATION`: in production with LOCAL_VALIDATION off, MagicDNS http URLs are
still rejected (must be HTTPS). Loopback behavior unchanged.

## 2. Test matrix (env.schema.spec.ts, new describe)

1. prod, no LOCAL_VALIDATION, MagicDNS http → FAIL ✓
2. prod, LOCAL_VALIDATION=1, MagicDNS http → PASS ✓
3. prod, LOCAL_VALIDATION=1, https → PASS ✓
4. prod, LOCAL_VALIDATION=1, loopback http → PASS ✓
5. prod, LOCAL_VALIDATION=1, `http://example.com` → FAIL ✓
6. prod, LOCAL_VALIDATION=1, `*.example.ts.net` → PASS ✓

14/14 tests pass (orchestrator re-run confirmed).

## 3. Security

Exemption is MagicDNS-suffix-scoped AND LOCAL_VALIDATION-gated. Arbitrary public HTTP hosts
(example.com) still fail. Typecheck: only pre-existing stale-dist errors (goal/task) unrelated.

## 4. Gate

Review passes. Note: env.schema.spec.ts was an existing test file (edit, not new file), so no
test-inventory regeneration needed. Proceed to push + CI.
