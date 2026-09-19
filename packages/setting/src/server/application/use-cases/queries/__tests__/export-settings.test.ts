import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserPreferenceProfile } from '@memoflow/contracts/setting';
import { ExportSettings } from '../export-settings';
import type { PreferencePortableService } from '../../../../preferences/preference-portability';

const profile: UserPreferenceProfile = {
  presentation: { theme: 'dark', language: 'en-US' },
  regional: {
    timeZone: 'Asia/Tokyo',
    dateStyle: 'long',
    timeStyle: '12h',
    weekStartsOn: 0,
  },
};

describe('ExportSettings V3', () => {
  let portableService: PreferencePortableService;
  let useCase: ExportSettings;

  beforeEach(() => {
    portableService = {
      export: vi.fn().mockResolvedValue(profile),
    } as unknown as PreferencePortableService;
    useCase = new ExportSettings(portableService, () => '2026-09-10T05:00:00.000Z');
  });

  it('exports strict preference-only V3 without identity or persistence metadata', async () => {
    const result = await useCase.execute('destination-user');
    expect(result.fileName).toBe('memoflow-settings-2026-09-10T05-00-00-000Z.json');
    expect(JSON.parse(result.data)).toEqual({
      schemaVersion: 3,
      exportedAt: '2026-09-10T05:00:00.000Z',
      preferences: profile,
    });
    expect(result.data).not.toContain('destination-user');
    expect(result.data).not.toContain('revision');
    expect(portableService.export).toHaveBeenCalledWith('destination-user');
  });
});
