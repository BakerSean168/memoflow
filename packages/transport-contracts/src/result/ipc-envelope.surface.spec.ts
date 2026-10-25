import { describe, expect, it } from 'vitest';
import { isIpcResultEnvelope, toIpcResult, ok, fail } from './index';

/**
 * IpcResult envelope surface (stage-6 residual 73):
 * Strict detector requires ok + data/error — no domain-ok dual-track misclassification.
 */
describe('isIpcResultEnvelope surface', () => {
  it('accepts toIpcResult success and failure envelopes', () => {
    expect(isIpcResultEnvelope(toIpcResult(ok({ id: 1 })))).toBe(true);
    expect(isIpcResultEnvelope(toIpcResult(fail({ code: 'X', message: 'no' })))).toBe(true);
    expect(isIpcResultEnvelope(ok(null))).toBe(true);
    expect(isIpcResultEnvelope(fail({ code: 'Y', message: 'no' }))).toBe(true);
  });

  it('rejects raw payloads and domain ok DTOs without data/error', () => {
    expect(isIpcResultEnvelope('raw string')).toBe(false);
    expect(isIpcResultEnvelope(null)).toBe(false);
    expect(isIpcResultEnvelope({ custom: 'format' })).toBe(false);
    expect(isIpcResultEnvelope({ ok: true, authenticated: false })).toBe(false);
    expect(isIpcResultEnvelope({ ok: true, hasValidSession: false })).toBe(false);
  });
});
