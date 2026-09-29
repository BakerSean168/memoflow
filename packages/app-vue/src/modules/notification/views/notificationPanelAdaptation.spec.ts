import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const notificationSource = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), 'NotificationListPage.vue'),
  'utf8',
);

describe('Notification single-page architecture', () => {
  it('owns one inbox toolbar without panel-tier structure branches', () => {
    expect(notificationSource).toContain('data-testid="notification-page-toolbar"');
    // Notification shares the same product header primitive as Goal / Task.
    expect(notificationSource).toContain('<ModuleHeader data-testid="notification-page-toolbar">');
    expect(notificationSource).not.toContain('<header');
    expect(notificationSource).not.toContain('FilterBar');
    expect(notificationSource).not.toContain('usePanelWidth');
    expect(notificationSource).not.toContain('isNarrow');
    expect(notificationSource).toContain('data-testid="mark-all-read-button"');
    expect(notificationSource).toContain(':aria-selected="selectedFilter === tab.value"');
  });
});
