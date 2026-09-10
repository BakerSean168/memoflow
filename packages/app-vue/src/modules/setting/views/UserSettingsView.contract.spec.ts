/**
 * UserSettingsView desktop settings IA contract (Phase 3)
 *
 * 轻量源码契约：分组单一模型（7 组）、宽屏 sticky 分类导航、正式 active
 * 语义（aria-current）。避免为纯布局语义 mount 整棵设置子树。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'UserSettingsView.vue'),
  'utf-8',
);

describe('UserSettingsView desktop settings IA (Phase 3)', () => {
  it('keeps a single group model with exactly 7 groups and no stale count comment', () => {
    const definitions =
      source.match(/const GROUP_DEFINITIONS:[\s\S]*?\]\s*;\s*\n\nconst GROUP_VALUES/)?.[0] ?? '';
    const values = definitions.match(/\{ value: '[a-z]+'/g) ?? [];
    expect(values).toHaveLength(7);
    expect(source).toContain('const GROUP_VALUES: SettingsGroup[] = GROUP_DEFINITIONS.map');
    expect(source).toMatch(/重组为 7 组/);
    expect(source).not.toMatch(/重组为 6 组/);
  });

  it('keeps the wide sidebar sticky relative to the settings content scroll container', () => {
    expect(source).toMatch(/'sticky top-0 w-48 flex-col self-start overflow-visible'/);
  });

  it('marks the active group with aria-current for keyboard and AT feedback', () => {
    expect(source).toMatch(/:aria-current="activeTab === group\.value \? 'page' : undefined"/);
  });

  it('still routes every group value through a single derived GROUP_VALUES list', () => {
    const groupValues = source.match(
      /const GROUP_VALUES: SettingsGroup\[\] = GROUP_DEFINITIONS\.map\(\(group\) => group\.value\);/,
    );
    expect(groupValues).not.toBeNull();
  });

  it('gates cloud password settings on the full AuthService capability', () => {
    expect(source).toContain('inject(AUTH_SERVICE_KEY, null)');
    expect(source).toContain('<CloudPasswordSection v-if="cloudPasswordService" />');
    // Desktop must degrade by capability, not by a platform-name branch.
    expect(source).not.toMatch(/isDesktop[^\n]*CloudPasswordSection/);
  });

  it('does not mount retired privacy, experimental, or cloud shortcut editors', () => {
    expect(source).not.toContain('PrivacySettings');
    expect(source).not.toContain('ExperimentalSettings');
    expect(source).not.toContain('ShortcutSettings');
    expect(source).not.toContain('shareUsageData');
    expect(source).not.toContain('shortcutCategories');
  });

  it('keeps real AI and canonical appearance/locale surfaces', () => {
    expect(source).toContain('<AISettings />');
    expect(source).toContain('<AppearanceSettings');
    expect(source).toContain('<LocaleSettings');
    expect(source).not.toContain('currency');
  });
});
