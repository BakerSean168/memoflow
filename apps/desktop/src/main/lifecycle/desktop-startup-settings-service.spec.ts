import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DesktopLifecyclePreference } from './desktop-lifecycle-preference';
import { DesktopStartupSettingsService } from './desktop-startup-settings-service';
import type { AutoLaunchPort } from '../capabilities/ports';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function harness() {
  const root = mkdtempSync(path.join(tmpdir(), 'startup-settings-'));
  roots.push(root);
  const preference = new DesktopLifecyclePreference(path.join(root, 'preference.json'));
  let enabled = false;
  const port: AutoLaunchPort = {
    init: vi.fn(async () => undefined),
    isEnabled: vi.fn(async () => enabled),
    enable: vi.fn(async () => {
      enabled = true;
      return true;
    }),
    disable: vi.fn(async () => {
      enabled = false;
      return true;
    }),
  };
  let current: AutoLaunchPort | null = null;
  const service = new DesktopStartupSettingsService(preference, () => current);
  return {
    service,
    port,
    preference,
    attach: () => {
      current = port;
    },
  };
}

describe('DesktopStartupSettingsService', () => {
  it('resolves the late-registered port without enabling startup, then reads back enable/disable', async () => {
    const h = harness();
    expect((await h.service.refresh()).autoLaunch.available).toBe(false);
    h.attach();
    expect((await h.service.refresh()).autoLaunch).toEqual({ available: true, enabled: false });
    expect(h.port.enable).not.toHaveBeenCalled();
    const listener = vi.fn();
    const off = h.service.subscribe(listener);
    expect(await h.service.update({ autoLaunch: true })).toMatchObject({
      success: true,
      snapshot: { autoLaunch: { enabled: true } },
    });
    expect(await h.service.update({ autoLaunch: false })).toMatchObject({
      success: true,
      snapshot: { autoLaunch: { enabled: false } },
    });
    off();
    await h.service.update({ closeToTray: false, startHidden: false });
    expect(listener).toHaveBeenCalledTimes(2);
    expect(h.preference).toMatchObject({ closeToTray: false, startHidden: false });
  });
  it('rejects a successful operation whose read-back disagrees, returning the real state', async () => {
    const h = harness();
    h.attach();
    vi.mocked(h.port.enable).mockResolvedValue(true);
    expect(await h.service.update({ autoLaunch: true })).toMatchObject({
      success: false,
      snapshot: { autoLaunch: { enabled: false } },
    });
  });
  it('reports missing ports, failed operations and unreadable system state', async () => {
    const h = harness();
    expect((await h.service.update({ autoLaunch: true })).success).toBe(false);
    h.attach();
    vi.mocked(h.port.enable).mockRejectedValue(new Error('denied'));
    expect(await h.service.update({ autoLaunch: true })).toMatchObject({
      success: false,
      snapshot: { autoLaunch: { available: true, enabled: false } },
    });
    vi.mocked(h.port.isEnabled).mockRejectedValue(new Error('unreadable'));
    expect((await h.service.refresh()).autoLaunch.available).toBe(false);
  });
  it('serializes competing callers so each gets its verified state', async () => {
    const h = harness();
    h.attach();
    const results = await Promise.all([
      h.service.update({ autoLaunch: true }),
      h.service.update({ autoLaunch: false }),
    ]);
    expect(results.map((r) => [r.success, r.snapshot.autoLaunch.enabled])).toEqual([
      [true, true],
      [true, false],
    ]);
  });
});
