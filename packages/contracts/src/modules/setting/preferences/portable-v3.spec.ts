import { describe, expect, it } from 'vitest';
import {
  PreferencePortableDocumentV3Schema,
  PreferencePortablePayloadV3Schema,
} from './portable-v3';

const canonical = {
  presentation: { theme: 'dark', language: 'zh-CN' },
  regional: {
    timeZone: 'Asia/Shanghai',
    dateStyle: 'medium',
    timeStyle: '24h',
    weekStartsOn: 1,
  },
} as const;

describe('Preference portability V3 contracts', () => {
  it('accepts only canonical presentation/regional owner state', () => {
    expect(PreferencePortablePayloadV3Schema.safeParse(canonical).success).toBe(true);
    expect(
      PreferencePortablePayloadV3Schema.safeParse({
        ...canonical,
        identityId: 'source-user',
      }).success,
    ).toBe(false);
    expect(
      PreferencePortablePayloadV3Schema.safeParse({
        ...canonical,
        notification: { enabled: true },
      }).success,
    ).toBe(false);
    expect(
      PreferencePortablePayloadV3Schema.safeParse({
        ...canonical,
        device: { soundEnabled: false },
      }).success,
    ).toBe(false);
  });

  it('uses schemaVersion 3 for the standalone preference document', () => {
    expect(
      PreferencePortableDocumentV3Schema.safeParse({
        schemaVersion: 3,
        exportedAt: '2026-09-10T05:00:00.000Z',
        preferences: canonical,
      }).success,
    ).toBe(true);
    expect(
      PreferencePortableDocumentV3Schema.safeParse({
        schemaVersion: 2,
        exportedAt: '2026-09-10T05:00:00.000Z',
        preferences: canonical,
      }).success,
    ).toBe(false);
  });
});
