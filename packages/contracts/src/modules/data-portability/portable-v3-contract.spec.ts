import { describe, expect, it } from 'vitest';
import {
  parsePortableBackupEnvelopeV3,
  PortableBackupEnvelopeV3Schema,
  PortableReferenceV3Schema,
} from './index';

const baseEnvelope = {
  format: 'memoflow.user-data-export' as const,
  schemaVersion: 3 as const,
  exportedAt: '2026-09-10T04:30:00.000Z',
  productVersion: '1.0.0',
  capabilities: [] as Array<{
    key: string;
    schemaVersion: number;
    payload: unknown;
  }>,
};

describe('PortableReferenceV3', () => {
  it('accepts stable capability-scoped refs and rejects ambiguous forms', () => {
    expect(PortableReferenceV3Schema.safeParse('goals:1').success).toBe(true);
    expect(PortableReferenceV3Schema.safeParse('notification-preferences:42').success).toBe(true);
    expect(PortableReferenceV3Schema.safeParse('Goal:1').success).toBe(false);
    expect(PortableReferenceV3Schema.safeParse('goals:0').success).toBe(false);
    expect(PortableReferenceV3Schema.safeParse('goals/id').success).toBe(false);
    expect(PortableReferenceV3Schema.safeParse('goals:abc').success).toBe(false);
  });
});

describe('PortableBackupEnvelopeV3', () => {
  it('accepts owner capability envelopes without knowing owner payload shapes', () => {
    expect(
      PortableBackupEnvelopeV3Schema.safeParse({
        ...baseEnvelope,
        capabilities: [
          { key: 'goals', schemaVersion: 3, payload: { items: [] } },
          { key: 'notification-preferences', schemaVersion: 2, payload: { inApp: true } },
        ],
      }).success,
    ).toBe(true);
  });

  it('requires unique lowercase capability keys and positive capability versions', () => {
    expect(
      PortableBackupEnvelopeV3Schema.safeParse({
        ...baseEnvelope,
        capabilities: [
          { key: 'goals', schemaVersion: 3, payload: {} },
          { key: 'goals', schemaVersion: 3, payload: {} },
        ],
      }).success,
    ).toBe(false);
    expect(
      PortableBackupEnvelopeV3Schema.safeParse({
        ...baseEnvelope,
        capabilities: [{ key: 'Goal', schemaVersion: 0, payload: {} }],
      }).success,
    ).toBe(false);
  });

  it('rejects V2 envelopes instead of treating them as V3', () => {
    expect(
      PortableBackupEnvelopeV3Schema.safeParse({
        kind: 'memoflow.user-data-export',
        schemaVersion: 2,
        exportedAt: baseEnvelope.exportedAt,
        scope: { includesBinaryResources: false, importMode: 'append-create-like' },
        data: {},
      }).success,
    ).toBe(false);
  });
});

describe('parsePortableBackupEnvelopeV3', () => {
  it('returns a typed V3 envelope', () => {
    const result = parsePortableBackupEnvelopeV3({
      ...baseEnvelope,
      capabilities: [{ key: 'goals', schemaVersion: 3, payload: { items: [] } }],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.envelope.capabilities[0]?.key).toBe('goals');
  });

  it('fail-closes banned persistent identity and secret-shaped keys inside capability payloads', () => {
    const identity = parsePortableBackupEnvelopeV3({
      ...baseEnvelope,
      capabilities: [{ key: 'goals', schemaVersion: 3, payload: { identityId: 'source-user' } }],
    });
    expect(identity).toEqual({
      ok: false,
      error: 'Envelope validation failed: capabilities.0.payload.identityId — banned import field',
    });

    const secret = parsePortableBackupEnvelopeV3({
      ...baseEnvelope,
      capabilities: [{ key: 'ai', schemaVersion: 1, payload: { provider: { apiKey: 'secret' } } }],
    });
    expect(secret.ok).toBe(false);
  });

  it('keeps server-held disclosure explicitly non-importable', () => {
    expect(parsePortableBackupEnvelopeV3({ kind: 'memoflow.server-held-data-disclosure' })).toEqual({
      ok: false,
      error:
        'Server-held data disclosure is not importable. Export/import only memoflow.user-data-export business backups.',
    });
  });
});
