import { describe, it, expect } from 'vitest';
import { UserSetting } from '../user-setting';
import { getDefaultPreferences } from '@memoflow/contracts/setting';

describe('UserSetting Aggregate Root', () => {
  const testIdentityId = 'IdentityId_550e8400-e29b-41d4-a716-446655440000';

  describe('create()', () => {
    it('should create a new user setting with default preferences', () => {
      const setting = UserSetting.create({ identityId: testIdentityId });

      expect(setting.id).toBeTruthy();
      expect(setting.identityId).toBe(testIdentityId);
      expect(setting.version).toBe(1);
      expect(typeof setting.createdAt).toBe('number');
      expect(typeof setting.updatedAt).toBe('number');

      const prefs = setting.toPreferences();
      const defaults = getDefaultPreferences();
      expect(prefs.appearance).toEqual(defaults.appearance);
      expect(prefs.locale).toEqual(defaults.locale);
    });

    it('should apply overrides when creating', () => {
      const setting = UserSetting.create({
        identityId: testIdentityId,
        overrides: { appearance: { theme: 'dark' } },
      });

      expect(setting.toPreferences().appearance.theme).toBe('dark');
    });

    it('should emit UserSettingCreatedEvent', () => {
      const setting = UserSetting.create({ identityId: testIdentityId });
      const events = setting.pullDomainEvents();

      expect(events.length).toBe(1);
      expect(events[0].eventType).toBe('setting:user-setting-created');
      expect(events[0].payload).toEqual({ identityId: testIdentityId });
    });
  });

  describe('patchCategory()', () => {
    it('should update a single category field', () => {
      const setting = UserSetting.create({ identityId: testIdentityId });
      setting.pullDomainEvents(); // clear create event

      setting.patchCategory('appearance', { theme: 'dark' });

      expect(setting.toPreferences().appearance.theme).toBe('dark');
      expect(setting.version).toBe(2);
    });

    it('should update multiple fields in a category', () => {
      const setting = UserSetting.create({ identityId: testIdentityId });
      setting.pullDomainEvents();

      setting.patchCategory('locale', { language: 'en-US', timezone: 'America/New_York' });

      expect(setting.toPreferences().locale.language).toBe('en-US');
      expect(setting.toPreferences().locale.timezone).toBe('America/New_York');
      expect(setting.toPreferences().locale.currency).toBe('CNY'); // default preserved
    });

    it('should reject the retired notification category', () => {
      const setting = UserSetting.create({ identityId: testIdentityId });
      expect(() => setting.patchCategory('notification' as never, {})).toThrow();
    });

    it('should increment version on each patch', () => {
      const setting = UserSetting.create({ identityId: testIdentityId });
      expect(setting.version).toBe(1);

      setting.patchCategory('appearance', { theme: 'dark' });
      expect(setting.version).toBe(2);

      setting.patchCategory('locale', { language: 'en-US' });
      expect(setting.version).toBe(3);
    });

    it('should reject invalid category', () => {
      const setting = UserSetting.create({ identityId: testIdentityId });

      expect(() => setting.patchCategory('invalid' as any, {})).toThrow();
    });

    it('should reject invalid values via Zod validation', () => {
      const setting = UserSetting.create({ identityId: testIdentityId });

      expect(() => setting.patchCategory('appearance', { theme: 123 as any })).toThrow();
    });
  });

  describe('get() / set()', () => {
    it('should get a value by dot-notation key', () => {
      const setting = UserSetting.create({ identityId: testIdentityId });

      expect(setting.get('appearance.theme')).toBe('auto');
      expect(setting.get('locale.language')).toBe('zh-CN');
    });

    it('should set a value by dot-notation key', () => {
      const setting = UserSetting.create({ identityId: testIdentityId });

      setting.set('appearance.theme', 'dark');
      expect(setting.get('appearance.theme')).toBe('dark');
    });

    it('should throw for invalid key format', () => {
      const setting = UserSetting.create({ identityId: testIdentityId });

      expect(() => setting.get('invalidkey')).toThrow();
    });
  });

  describe('resetCategory()', () => {
    it('should reset a category to defaults', () => {
      const setting = UserSetting.create({ identityId: testIdentityId });
      setting.patchCategory('appearance', { theme: 'dark' });

      setting.resetCategory('appearance');

      const defaults = getDefaultPreferences();
      expect(setting.toPreferences().appearance).toEqual(defaults.appearance);
    });

    it('should emit UserSettingResetEvent with category', () => {
      const setting = UserSetting.create({ identityId: testIdentityId });
      setting.pullDomainEvents();
      setting.patchCategory('appearance', { theme: 'dark' });
      setting.pullDomainEvents();

      setting.resetCategory('appearance');

      const events = setting.pullDomainEvents();
      expect(events.length).toBe(1);
      expect(events[0].eventType).toBe('setting:user-setting-reset');
      expect(events[0].payload).toMatchObject({
        identityId: testIdentityId,
        category: 'appearance',
      });
    });

    it('should reject unknown category', () => {
      const setting = UserSetting.create({ identityId: testIdentityId });

      expect(() => setting.resetCategory('invalid' as any)).toThrow();
    });
  });

  describe('resetAll()', () => {
    it('should reset all categories to defaults', () => {
      const setting = UserSetting.create({ identityId: testIdentityId });
      setting.patchCategory('appearance', { theme: 'dark' });
      setting.patchCategory('locale', { language: 'en-US' });

      setting.resetAll();

      const defaults = getDefaultPreferences();
      expect(setting.toPreferences()).toEqual(defaults);
    });

    it('should emit UserSettingResetEvent without category', () => {
      const setting = UserSetting.create({ identityId: testIdentityId });
      setting.pullDomainEvents();

      setting.resetAll();

      const events = setting.pullDomainEvents();
      expect(events.length).toBe(1);
      expect(events[0].eventType).toBe('setting:user-setting-reset');
      expect(events[0].payload).toMatchObject({ identityId: testIdentityId });
      expect((events[0].payload as any).category).toBeUndefined();
    });
  });

  describe('importPreferences()', () => {
    it('should import partial preferences', () => {
      const setting = UserSetting.create({ identityId: testIdentityId });

      setting.importPreferences({
        appearance: {
          theme: 'dark',
        },
        locale: {
          language: 'en-US',
          timezone: 'America/New_York',
          dateFormat: 'MM/DD/YYYY',
          timeFormat: '12H',
          currency: 'USD',
          weekStartsOn: 0,
        },
      });

      expect(setting.toPreferences().appearance.theme).toBe('dark');
      expect(setting.toPreferences().locale.language).toBe('en-US');
    });
  });

  describe('toPreferences()', () => {
    it('should return a deep copy', () => {
      const setting = UserSetting.create({ identityId: testIdentityId });

      const prefs1 = setting.toPreferences();
      prefs1.appearance.theme = 'dark';

      // Original should not be affected
      expect(setting.toPreferences().appearance.theme).toBe('auto');
    });
  });

  describe('toServerDTO() / toClientDTO()', () => {
    it('should return DTO with preferences wrapper', () => {
      const setting = UserSetting.create({ identityId: testIdentityId });

      const serverDTO = setting.toServerDTO();
      expect(serverDTO.id).toBeTruthy();
      expect(serverDTO.identityId).toBe(testIdentityId);
      expect(serverDTO.preferences).toBeDefined();
      expect(serverDTO.preferences.appearance.theme).toBe('auto');
      expect(serverDTO.version).toBe(1);
      expect(typeof serverDTO.createdAt).toBe('number');
      expect(typeof serverDTO.updatedAt).toBe('number');

      const clientDTO = setting.toClientDTO();
      expect(clientDTO.preferences).toBeDefined();
      expect(clientDTO.preferences.appearance.theme).toBe('auto');
    });
  });

  describe('load()', () => {
    it('should reconstruct from state without emitting events', () => {
      const original = UserSetting.create({ identityId: testIdentityId });
      original.patchCategory('appearance', { theme: 'dark' });
      const state = {
        id: original.id,
        identityId: original.identityId,
        preferences: original.toPreferences(),
        version: original.version,
        createdAt: original.createdAt,
        updatedAt: original.updatedAt,
      };

      const loaded = UserSetting.load(state);

      expect(loaded.id).toBe(original.id);
      expect(loaded.toPreferences().appearance.theme).toBe('dark');
      expect(loaded.pullDomainEvents().length).toBe(0);
    });
  });
});
