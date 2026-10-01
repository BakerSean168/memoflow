import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Desktop Update shell indicator integration', () => {
  const appShellSource = readFileSync(resolve(__dirname, 'AppShell.vue'), 'utf8');
  const headerSource = readFileSync(resolve(__dirname, 'WindowHeader.vue'), 'utf8');

  it('keeps updater knowledge in AppShell and the indicator, not WindowHeader', () => {
    expect(appShellSource).toContain(
      "import DesktopUpdateShellIndicator from './DesktopUpdateShellIndicator.vue'",
    );
    expect(appShellSource).toContain('<template #status-actions>');
    expect(appShellSource).toContain(
      '<DesktopUpdateShellIndicator @open-updates="openUpdateSettings" />',
    );

    expect(headerSource).toContain('<slot name="status-actions" />');
    expect(headerSource).not.toContain('DesktopUpdate');
    expect(headerSource).not.toContain('desktop-update');
  });

  it('routes the indicator to the durable About & Updates settings surface', () => {
    expect(appShellSource).toContain("void sync.openSettings('/settings?tab=updates')");
    expect(appShellSource).not.toContain('restartAndInstall');
  });
});
