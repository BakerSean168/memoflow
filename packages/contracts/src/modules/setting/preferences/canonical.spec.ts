import { describe, expect, it } from 'vitest';
import {
  DEFAULT_USER_PREFERENCE_PROFILE,
  PREFERENCE_NAMESPACES,
  PREFERENCE_NAMESPACE_REGISTRY,
  PreferenceMutationReceiptSchema,
  PreferenceNamespaceResponseSchema,
  PreferenceNamespaceSchema,
  PreferenceRevisionConflictSchema,
  PresentationPreferencesSchema,
  RegionalPreferencesSchema,
  UserPreferenceProfileSchema,
  createDefaultUserPreferenceProfile,
} from './canonical';

describe('canonical user preference contracts', () => {
  it('keeps the namespace registry closed', () => {
    expect(PREFERENCE_NAMESPACES).toEqual(['presentation', 'regional']);
    expect(Object.keys(PREFERENCE_NAMESPACE_REGISTRY)).toEqual(PREFERENCE_NAMESPACES);
    expect(PreferenceNamespaceSchema.safeParse('presentation').success).toBe(true);
    expect(PreferenceNamespaceSchema.safeParse('workflow').success).toBe(false);
  });

  it('rejects unknown namespace and preference keys', () => {
    expect(
      PresentationPreferencesSchema.safeParse({
        theme: 'auto',
        language: 'en-US',
        typo: true,
      }).success,
    ).toBe(false);
    expect(
      RegionalPreferencesSchema.safeParse({
        timeZone: 'UTC',
        dateStyle: 'medium',
        timeStyle: '24h',
        weekStartsOn: 1,
        currency: 'USD',
      }).success,
    ).toBe(false);
    expect(
      UserPreferenceProfileSchema.safeParse({
        presentation: { theme: 'auto', language: 'en-US' },
        regional: {
          timeZone: 'UTC',
          dateStyle: 'medium',
          timeStyle: '24h',
          weekStartsOn: 1,
        },
        notification: { useCustomNotification: true },
      }).success,
    ).toBe(false);
  });

  it('accepts supported values and validates the IANA timezone boundary', () => {
    expect(
      RegionalPreferencesSchema.parse({
        timeZone: 'UTC',
        dateStyle: 'short',
        timeStyle: '12h',
        weekStartsOn: 0,
      }).timeZone,
    ).toBe('UTC');
    expect(
      RegionalPreferencesSchema.parse({
        timeZone: 'Asia/Tokyo',
        dateStyle: 'long',
        timeStyle: '24h',
        weekStartsOn: 6,
      }).timeZone,
    ).toBe('Asia/Tokyo');
    expect(
      RegionalPreferencesSchema.safeParse({
        timeZone: 'Mars/Olympus_Mons',
        dateStyle: 'medium',
        timeStyle: '24h',
        weekStartsOn: 1,
      }).success,
    ).toBe(false);
  });

  it('provides pure deterministic UTC defaults without persistence identity fields', () => {
    const first = createDefaultUserPreferenceProfile();
    const second = createDefaultUserPreferenceProfile();

    expect(first).toEqual({
      presentation: { theme: 'auto', language: 'zh-CN' },
      regional: {
        timeZone: 'UTC',
        dateStyle: 'medium',
        timeStyle: '24h',
        weekStartsOn: 1,
      },
    });
    expect(first).not.toBe(second);
    expect(first.presentation).not.toBe(second.presentation);
    expect(first.regional).not.toBe(second.regional);
    expect(DEFAULT_USER_PREFERENCE_PROFILE).toEqual(first);
    expect(Object.keys(first)).toEqual(['presentation', 'regional']);
    expect(first).not.toHaveProperty('identityId');
    expect(first).not.toHaveProperty('id');
    expect(first).not.toHaveProperty('revision');
  });

  it('keeps response, receipt, and conflict shapes strict', () => {
    expect(
      PreferenceNamespaceResponseSchema.safeParse({
        namespace: 'presentation',
        preferences: { theme: 'dark', language: 'en-US' },
        revision: 0,
        extra: true,
      }).success,
    ).toBe(false);
    expect(
      PreferenceMutationReceiptSchema.parse({
        namespace: 'regional',
        revision: 2,
        changedKeys: ['timeZone'],
      }),
    ).toEqual({ namespace: 'regional', revision: 2, changedKeys: ['timeZone'] });
    expect(
      PreferenceRevisionConflictSchema.parse({
        code: 'preference_revision_conflict',
        namespace: 'regional',
        expectedRevision: 1,
        latest: {
          namespace: 'regional',
          preferences: {
            timeZone: 'UTC',
            dateStyle: 'medium',
            timeStyle: '24h',
            weekStartsOn: 1,
          },
          revision: 2,
        },
      }),
    ).toMatchObject({
      code: 'preference_revision_conflict',
      expectedRevision: 1,
      latest: { revision: 2 },
    });
  });
});
