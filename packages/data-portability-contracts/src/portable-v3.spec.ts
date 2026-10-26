/**
 * Portable v3 base contract tests.
 *
 * The base owns only orchestration metadata: capability keys, capability
 * references and the backup envelope. Payload semantics belong to the
 * registering product modules.
 */
import { describe, expect, it } from 'vitest';
import {
  PortableBackupEnvelopeV3Schema,
  PortableCapabilityEnvelopeV3Schema,
  PortableCapabilityKeySchema,
  PortableReferenceV3Schema,
} from './index';

describe('PortableCapabilityKeySchema', () => {
  it('accepts lowercase kebab-case capability keys', () => {
    expect(PortableCapabilityKeySchema.parse('goal')).toBe('goal');
    expect(PortableCapabilityKeySchema.parse('data-portability')).toBe('data-portability');
  });

  it('rejects non kebab-case keys', () => {
    expect(() => PortableCapabilityKeySchema.parse('Goal')).toThrow();
    expect(() => PortableCapabilityKeySchema.parse('1goal')).toThrow();
    expect(() => PortableCapabilityKeySchema.parse('goal_v3')).toThrow();
  });
});

describe('PortableReferenceV3Schema', () => {
  it('accepts capability-scoped references', () => {
    expect(PortableReferenceV3Schema.parse('goal:1')).toBe('goal:1');
    expect(PortableReferenceV3Schema.parse('label:42')).toBe('label:42');
  });

  it('rejects unscoped or zero-version references', () => {
    expect(() => PortableReferenceV3Schema.parse('goal')).toThrow();
    expect(() => PortableReferenceV3Schema.parse('goal:0')).toThrow();
    expect(() => PortableReferenceV3Schema.parse(':1')).toThrow();
  });
});

describe('PortableCapabilityEnvelopeV3Schema', () => {
  it('accepts a strict capability envelope with a JSON payload', () => {
    const parsed = PortableCapabilityEnvelopeV3Schema.parse({
      key: 'goal',
      schemaVersion: 3,
      payload: { items: [] },
    });
    expect(parsed.key).toBe('goal');
  });

  it('rejects unknown fields', () => {
    expect(() =>
      PortableCapabilityEnvelopeV3Schema.parse({
        key: 'goal',
        schemaVersion: 3,
        payload: {},
        extra: true,
      }),
    ).toThrow();
  });
});

describe('PortableBackupEnvelopeV3Schema', () => {
  const base = {
    format: 'memoflow.user-data-export',
    schemaVersion: 3,
    exportedAt: '2026-10-26T00:00:00.000Z',
    productVersion: '0.22.1',
    capabilities: [{ key: 'goal', schemaVersion: 3, payload: {} }],
  };

  it('accepts a well-formed backup envelope', () => {
    expect(PortableBackupEnvelopeV3Schema.parse(base).format).toBe('memoflow.user-data-export');
  });

  it('rejects duplicate capability keys', () => {
    expect(() =>
      PortableBackupEnvelopeV3Schema.parse({
        ...base,
        capabilities: [
          { key: 'goal', schemaVersion: 3, payload: {} },
          { key: 'goal', schemaVersion: 3, payload: {} },
        ],
      }),
    ).toThrow(/Duplicate capability key: goal/);
  });

  it('rejects a foreign format literal', () => {
    expect(() =>
      PortableBackupEnvelopeV3Schema.parse({ ...base, format: 'other.format' }),
    ).toThrow();
  });
});
