import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import { anIdentityId } from '@memoflow/test-utils/fixtures';
import type { IUserSettingRepository } from '../../../../domain/repositories/i-user-setting-repository';
import { UserSetting } from '../../../../domain/aggregates/user-setting';
import { getDefaultPreferences } from '@memoflow/contracts/setting';
import { ImportSettings } from '../import-settings';

// Mock eventBus to prevent real event publishing
vi.mock('@memoflow/utils', async () => {
  const actual = await vi.importActual<typeof import('@memoflow/utils')>('@memoflow/utils');
  return { ...actual, eventBus: { send: vi.fn() } };
});

function anImportPayload(overrides: Record<string, unknown> = {}) {
  return {
    version: '2.0.0',
    settings: {
      appearance: { theme: 'dark' },
      ...((overrides.settings as Record<string, unknown>) ?? {}),
    },
    ...overrides,
  };
}

describe('ImportSettings', () => {
  let repo: ReturnType<typeof createMockRepo<IUserSettingRepository>>;
  let useCase: ImportSettings;
  const identityId = anIdentityId();

  beforeEach(() => {
    vi.clearAllMocks();
    repo = createMockRepo<IUserSettingRepository>({
      findByIdentityId: vi.fn().mockResolvedValue(null),
      save: vi.fn().mockResolvedValue(undefined),
    });
    useCase = new ImportSettings(repo);
  });

  it('should create new setting and import when none exists', async () => {
    const data = anImportPayload();

    const result = await useCase.execute(identityId, data);

    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(result.preferences.appearance.theme).toBe('dark');
  });

  it('should replace all settings when merge=false (default)', async () => {
    const existing = UserSetting.create({ identityId });
    existing.patchCategory('locale', { language: 'en-US' });
    vi.mocked(repo.findByIdentityId).mockResolvedValue(existing);

    const data = anImportPayload({
      settings: { appearance: { theme: 'dark' } },
    });

    const result = await useCase.execute(identityId, data);

    // locale should be reset to default because merge=false calls resetAll first
    const defaults = getDefaultPreferences();
    expect(result.preferences.locale.language).toBe(defaults.locale.language);
    expect(result.preferences.appearance.theme).toBe('dark');
  });

  it('should merge with existing settings when merge=true', async () => {
    const existing = UserSetting.create({ identityId });
    existing.patchCategory('locale', { language: 'en-US' });
    vi.mocked(repo.findByIdentityId).mockResolvedValue(existing);

    const data = anImportPayload({
      settings: { appearance: { theme: 'dark' } },
    });

    const result = await useCase.execute(identityId, data, { merge: true });

    // locale should be preserved
    expect(result.preferences.locale.language).toBe('en-US');
    expect(result.preferences.appearance.theme).toBe('dark');
  });

  it('should throw when settings field is missing', async () => {
    await expect(useCase.execute(identityId, { version: '2.0.0' })).rejects.toThrow(
      'missing settings field',
    );
  });

  it('should throw when version field is missing', async () => {
    await expect(useCase.execute(identityId, { settings: {} })).rejects.toThrow(
      'missing version field',
    );
  });

  it('should throw for unsupported version', async () => {
    await expect(useCase.execute(identityId, { version: '99.0.0', settings: {} })).rejects.toThrow(
      'Unsupported settings version',
    );
  });

  it('should accept version 1.0.0', async () => {
    const data = anImportPayload({ version: '1.0.0' });

    const result = await useCase.execute(identityId, data);

    expect(result.preferences.appearance.theme).toBe('dark');
  });

  it('should save the setting after import', async () => {
    const data = anImportPayload();

    await useCase.execute(identityId, data);

    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  it('should return a complete client DTO', async () => {
    const data = anImportPayload();

    const result = await useCase.execute(identityId, data);

    expect(result.id).toBeDefined();
    expect(result.identityId).toBe(identityId);
    expect(result.preferences).toBeDefined();
    expect(typeof result.version).toBe('number');
  });

  it.each(['workflow', 'privacy', 'shortcuts', 'experimental', 'ui', 'ai'])(
    'rejects retired category %s before saving',
    async (category) => {
      await expect(
        useCase.execute(identityId, anImportPayload({ settings: { [category]: {} } })),
      ).rejects.toThrow(`Rejected retired UserSetting category: ${category}`);
      expect(repo.findByIdentityId).not.toHaveBeenCalled();
      expect(repo.save).not.toHaveBeenCalled();
    },
  );

  it('rejects legacy shareUsageData=true with an explicit re-consent error', async () => {
    await expect(
      useCase.execute(
        identityId,
        anImportPayload({ settings: { privacy: { shareUsageData: true } } }),
      ),
    ).rejects.toThrow(/shareUsageData=true.*re-consent/);
    expect(repo.findByIdentityId).not.toHaveBeenCalled();
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('rejects locale.currency without applying or saving it', async () => {
    await expect(
      useCase.execute(identityId, anImportPayload({ settings: { locale: { currency: 'USD' } } })),
    ).rejects.toThrow(/locale\.currency.*not imported or applied/);
    expect(repo.findByIdentityId).not.toHaveBeenCalled();
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('rejects unknown legacy keys instead of silently stripping them', async () => {
    await expect(
      useCase.execute(identityId, anImportPayload({ settings: { locale: { unknown: true } } })),
    ).rejects.toThrow(/Rejected invalid UserSetting import/);
    expect(repo.findByIdentityId).not.toHaveBeenCalled();
    expect(repo.save).not.toHaveBeenCalled();
  });
});
