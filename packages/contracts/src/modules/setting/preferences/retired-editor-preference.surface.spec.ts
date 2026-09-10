import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CATEGORY_SCHEMAS,
  PREFERENCE_CATEGORIES,
  UserPreferencesSchema,
  getDefaultPreferences,
} from './index';

/**
 * Retired in-app editor preference category (stage-6 residual 202 / ADR-034):
 * packages/editor runtime is deleted; Monaco-like editor theme/fontSize/tabSize
 * preferences must not remain as a dual-track settings surface. Portable
 * editor_* backup tables stay in data-portability only.
 */
describe('retired editor preference category surface', () => {
  const repoRoot = resolve(__dirname, '../../../../../../');
  const schemasIndex = readFileSync(resolve(__dirname, 'schemas/index.ts'), 'utf8');
  const mockSetting = readFileSync(
    resolve(repoRoot, 'packages/contracts/src/mocks/setting.mock.ts'),
    'utf8',
  );
  const valueObjectsIndex = readFileSync(
    resolve(__dirname, '../value-objects/index.ts'),
    'utf8',
  );

  it('keeps only the live legacy appearance and locale categories', () => {
    expect(PREFERENCE_CATEGORIES).toEqual(['appearance', 'locale']);
    expect(getDefaultPreferences()).toEqual({
      appearance: { theme: 'auto' },
      locale: {
        language: 'zh-CN',
        timezone: 'Asia/Shanghai',
        dateFormat: 'YYYY-MM-DD',
        timeFormat: '24H',
        weekStartsOn: 1,
      },
    });
    expect(() =>
      UserPreferencesSchema.parse({ appearance: { theme: 'auto' }, workflow: {} } as never),
    ).toThrow();
    expect(() =>
      UserPreferencesSchema.parse({
        appearance: { theme: 'auto' },
        locale: { currency: 'USD' },
      } as never),
    ).toThrow();
  });

  it('preference schema and defaults have no editor category', () => {
    expect(existsSync(resolve(__dirname, 'schemas/editor.schema.ts'))).toBe(false);
    expect(schemasIndex).not.toContain('EditorSchema');
    expect(schemasIndex).not.toMatch(/\beditor\b/);
    expect(PREFERENCE_CATEGORIES).not.toContain('editor');
    expect(Object.keys(CATEGORY_SCHEMAS)).not.toContain('editor');
    expect(getDefaultPreferences()).not.toHaveProperty('editor');
    expect(UserPreferencesSchema.parse({})).not.toHaveProperty('editor');
  });

  it('stored editor preference blobs are stripped on parse (no dual-track keep)', () => {
    expect(() =>
      UserPreferencesSchema.parse({
        appearance: { theme: 'dark' },
        editor: { theme: 'monokai' },
      } as never),
    ).toThrow();
  });

  it('mock generators drop editor blobs; packages/editor stays deleted', () => {
    expect(mockSetting).not.toMatch(/\beditor:\s*\{/);
    expect(existsSync(resolve(repoRoot, 'packages/editor'))).toBe(false);
    expect(valueObjectsIndex).not.toContain('FontSize');
    expect(valueObjectsIndex).not.toContain('SettingCategory');
  });
  it('product setting.md records the current retired-category boundary (residual 327)', () => {
    const settingProduct = readFileSync(
      resolve(repoRoot, 'docs/product/modules/setting.md'),
      'utf8',
    );
    expect(settingProduct).toContain('legacy `UserSetting` 只保留 appearance + locale remainder');
    expect(settingProduct).toContain('`locale.currency` 已 retired');
    expect(settingProduct).toContain('Account 与 Notification shadow 已在 SETTING-9203/9204 中移除');
    expect(settingProduct).toContain('canonical presentation/regional preference 已是 current Settings consumer 的真值');
    expect(settingProduct).not.toContain('当前 `UserSetting.preferences` 有 9 个 category');
    expect(settingProduct).not.toContain('当前 Account 仍拥有');
    expect(settingProduct).not.toContain('UserSetting 仍有 `notification.email/push/inApp/sound/useCustomNotification`');
    expect(settingProduct).toContain('不含已退役的 in-app `editor`');
    expect(settingProduct).toContain('portable `editor_*`');
  });

});
