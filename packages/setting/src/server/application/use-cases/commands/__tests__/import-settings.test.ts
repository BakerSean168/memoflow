import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserPreferenceProfile } from '@memoflow/contracts/setting';
import type { PreferencePortableService } from '../../../../preferences/preference-portability';
import { ImportSettings } from '../import-settings';

const profile: UserPreferenceProfile = {
  presentation: { theme: 'dark', language: 'en-US' },
  regional: {
    timeZone: 'Asia/Tokyo',
    dateStyle: 'long',
    timeStyle: '12h',
    weekStartsOn: 0,
  },
};

function v3(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 3,
    exportedAt: '2026-09-10T05:00:00.000Z',
    preferences: profile,
    ...overrides,
  };
}

describe('ImportSettings V3', () => {
  let portableService: PreferencePortableService;
  let useCase: ImportSettings;

  beforeEach(() => {
    portableService = {
      apply: vi.fn().mockResolvedValue({ created: 1, updated: 1, skipped: 0, warnings: [] }),
    } as unknown as PreferencePortableService;
    useCase = new ImportSettings(portableService);
  });

  it('applies canonical V3 using only the host-owned identity', async () => {
    await expect(useCase.execute('destination-user', v3())).resolves.toEqual({
      schemaVersion: 3,
      imported: 2,
      skipped: 0,
      warnings: [],
    });
    expect(portableService.apply).toHaveBeenCalledWith('destination-user', profile);
  });

  it.each([1, 2, 4])('rejects non-V3 schemaVersion %s before mutation', async (schemaVersion) => {
    await expect(useCase.execute('destination-user', v3({ schemaVersion }))).rejects.toThrow(
      'only V3 is supported',
    );
    expect(portableService.apply).not.toHaveBeenCalled();
  });

  it('explicitly rejects the former V1/V2 settings shape', async () => {
    await expect(
      useCase.execute('destination-user', { version: '2.0.0', settings: { appearance: {} } }),
    ).rejects.toThrow('Legacy preference import V1/V2 is unsupported under ADR-111');
    expect(portableService.apply).not.toHaveBeenCalled();
  });

  it.each([
    ['source identity', { preferences: { ...profile, identityId: 'source-user' } }],
    ['device preference', { preferences: { ...profile, device: { soundEnabled: false } } }],
    ['notification owner', { preferences: { ...profile, notification: { inApp: false } } }],
    ['unknown key', { preferences: { ...profile, presentation: { ...profile.presentation, typo: true } } }],
  ])('rejects %s leakage before mutation', async (_name, overrides) => {
    await expect(useCase.execute('destination-user', v3(overrides))).rejects.toThrow(
      'Invalid preference V3 import',
    );
    expect(portableService.apply).not.toHaveBeenCalled();
  });
});
