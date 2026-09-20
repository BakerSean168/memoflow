import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const view = readFileSync(resolve(import.meta.dirname, 'UserSettingsView.vue'), 'utf8');
const navigation = readFileSync(
  resolve(import.meta.dirname, '../components/SettingsNavigation.vue'),
  'utf8',
);

describe('Settings scene three-state responsive contract', () => {
  it('keeps the full category sidebar only on wide settings surfaces', () => {
    expect(view).toContain('v-if="!isNarrow && shellStore.settingsNavigationOpen"');
    expect(view).toContain('data-testid="settings-group-sidebar"');
    expect(view).not.toContain('settings-group-tabs');
  });

  it('shows a compact local Settings header when the category sidebar is hidden by width', () => {
    expect(view).toContain('v-if="isNarrow"');
    expect(view).toContain('data-testid="settings-compact-header"');
    expect(view).toContain('data-testid="settings-compact-back"');
  });

  it('uses a left Sheet drawer on narrow surfaces and shares the same navigation renderer', () => {
    expect(view).toContain('side="left"');
    expect(view).toContain('data-testid="settings-navigation-drawer"');
    expect(view.match(/<SettingsNavigation/g)).toHaveLength(2);
    expect(navigation).toContain('data-testid="settings-return-to-app"');
    expect(navigation).toContain('LinearSidebarItem');
  });

  it('makes the settings content area the sole vertical scroll owner', () => {
    expect(view).toContain('data-testid="settings-content-scroll"');
    expect(view).toContain('min-h-0 flex-1 overflow-y-auto');
  });
});
