/** Settings Hub composition contract for SETTING-9207. */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'UserSettingsView.vue'),
  'utf-8',
);

describe('UserSettingsView owner composition', () => {
  it('exposes exactly six real owner groups and retires the fake Advanced tab', () => {
    const definitions =
      source.match(/const GROUP_DEFINITIONS:[\s\S]*?\]\s*;\s*\nconst GROUP_VALUES/)?.[0] ?? '';
    const values = definitions.match(/\{ value: '[a-z]+'/g) ?? [];

    expect(values).toHaveLength(6);
    expect(definitions).toContain("{ value: 'appearance'");
    expect(definitions).toContain("{ value: 'repository'");
    expect(definitions).toContain("{ value: 'ai'");
    expect(definitions).toContain("{ value: 'notifications'");
    expect(definitions).toContain("{ value: 'account'");
    expect(definitions).toContain("{ value: 'data'");
    expect(definitions).not.toContain("{ value: 'advanced'");
  });

  it('keeps the protected deep-link and test-id contract', () => {
    expect(source).toContain('const GROUP_VALUES: SettingsGroup[] = GROUP_DEFINITIONS.map');
    expect(source).toContain('route.query.tab');
    expect(source).toContain('`settings-tab-${group.value}`');
    expect(source).toMatch(/:aria-current="activeTab === group\.value \? 'page' : undefined"/);
  });

  it('owns navigation only instead of global owner loading or shadow mutation state', () => {
    expect(source).not.toContain('useUserSetting(');
    expect(source).not.toContain('useUserPreferences(');
    expect(source).not.toContain('useDataPortability(');
    expect(source).not.toContain('loadSettings(');
    expect(source).not.toContain('loadPreferences(');
    expect(source).not.toContain('isPageLoading');
    expect(source).not.toContain('backups');
    expect(source).not.toContain('syncStatus');
  });

  it('lazy-loads non-default owner sections so their failures cannot block General', () => {
    expect(source).toContain("defineAsyncComponent(() => import('../components/AISettings.vue'))");
    expect(source).toContain("import('../components/KnowledgeRepositorySettings.vue')");
    expect(source).toContain("import('../components/NotificationSettings.vue')");
    expect(source).toContain("import('../components/AccountSettingsSection.vue')");
    expect(source).toContain("import('../components/DataSettingsSection.vue')");
    expect(source).toContain('<UserPreferenceSettingsSection v-if="activeTab === \'appearance\'" />');
  });

  it('keeps the wide navigation sticky relative to the settings content container', () => {
    expect(source).toMatch(/'sticky top-0 w-48 flex-col self-start overflow-visible'/);
  });
});
