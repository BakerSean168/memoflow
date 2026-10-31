import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { DesktopLifecyclePreference } from './desktop-lifecycle-preference';

it('defaults close-to-tray on, persists opt-outs, and recovers malformed preferences', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'mf-lifecycle-'));
  const file = path.join(root, 'preferences.json');
  try {
    const preference = new DesktopLifecyclePreference(file);
    expect(preference.closeToTray).toBe(true);
    preference.update('closeToTray', false);
    preference.update('startHidden', false);
    expect(new DesktopLifecyclePreference(file)).toMatchObject({
      closeToTray: false,
      startHidden: false,
    });
    writeFileSync(file, 'invalid');
    expect(new DesktopLifecyclePreference(file).closeToTray).toBe(true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
