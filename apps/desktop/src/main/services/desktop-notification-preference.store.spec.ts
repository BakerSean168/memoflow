import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesktopNotificationPreferenceStore } from './desktop-notification-preference.store';

describe('DesktopNotificationPreferenceStore', () => {
  const tempRoots: string[] = [];

  afterEach(async () => {
    await Promise.all(tempRoots.splice(0).map((root) => fs.promises.rm(root, { recursive: true, force: true })));
  });

  async function tempPreferencePath(name = 'notification-preference.json') {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'desktop-notification-pref-'));
    tempRoots.push(root);
    return path.join(root, 'profile', 'ui', name);
  }

  it('owns the in-memory default and notifies subscribers on update/reset', () => {
    const store = new DesktopNotificationPreferenceStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    expect(store.get()).toEqual({ presentationMode: 'custom', soundEnabled: true });
    expect(store.update({ presentationMode: 'native' })).toEqual({
      presentationMode: 'native',
      soundEnabled: true,
    });
    expect(listener).toHaveBeenLastCalledWith({ presentationMode: 'native', soundEnabled: true });
    expect(store.reset()).toEqual({ presentationMode: 'custom', soundEnabled: true });
    unsubscribe();
    store.update({ soundEnabled: false });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('persists a versioned preference in the active Profile scope and reloads it', async () => {
    const preferencePath = await tempPreferencePath();
    const first = new DesktopNotificationPreferenceStore(() => preferencePath);
    expect(first.update({ presentationMode: 'native', soundEnabled: false })).toEqual({
      presentationMode: 'native',
      soundEnabled: false,
    });

    const persisted = JSON.parse(await fs.promises.readFile(preferencePath, 'utf8'));
    expect(persisted).toEqual({
      schemaVersion: 1,
      preference: { presentationMode: 'native', soundEnabled: false },
    });

    const reloaded = new DesktopNotificationPreferenceStore(() => preferencePath);
    expect(reloaded.get()).toEqual({ presentationMode: 'native', soundEnabled: false });
  });

  it('switches Profile scopes without leaking cached device preferences', async () => {
    const profileA = await tempPreferencePath('a.json');
    const profileB = await tempPreferencePath('b.json');
    let activePath: string | null = profileA;
    const store = new DesktopNotificationPreferenceStore(() => activePath);

    store.update({ presentationMode: 'native', soundEnabled: false });
    activePath = profileB;
    expect(store.get()).toEqual({ presentationMode: 'custom', soundEnabled: true });
    store.update({ soundEnabled: false });

    activePath = profileA;
    expect(store.get()).toEqual({ presentationMode: 'native', soundEnabled: false });
    activePath = profileB;
    expect(store.get()).toEqual({ presentationMode: 'custom', soundEnabled: false });
  });

  it('clears the previous Profile cache when no Profile is active and refuses mutation', async () => {
    const preferencePath = await tempPreferencePath();
    let activePath: string | null = preferencePath;
    const store = new DesktopNotificationPreferenceStore(() => activePath);
    store.update({ presentationMode: 'native', soundEnabled: false });

    activePath = null;
    expect(store.get()).toEqual({ presentationMode: 'custom', soundEnabled: true });
    expect(() => store.update({ soundEnabled: false })).toThrow(
      'Desktop notification preference requires an active Profile',
    );
    expect(() => store.reset()).toThrow('Desktop notification preference requires an active Profile');
  });

  it('fail-closes corrupt/unknown persisted values to canonical defaults', async () => {
    const preferencePath = await tempPreferencePath();
    await fs.promises.mkdir(path.dirname(preferencePath), { recursive: true });
    await fs.promises.writeFile(
      preferencePath,
      JSON.stringify({ schemaVersion: 1, preference: { presentationMode: 'system', soundEnabled: true } }),
      'utf8',
    );
    const store = new DesktopNotificationPreferenceStore(() => preferencePath);
    expect(store.get()).toEqual({ presentationMode: 'custom', soundEnabled: true });
  });

  it('reset affects only the active Profile file', async () => {
    const profileA = await tempPreferencePath('a.json');
    const profileB = await tempPreferencePath('b.json');
    let activePath: string | null = profileA;
    const store = new DesktopNotificationPreferenceStore(() => activePath);
    store.update({ presentationMode: 'native' });
    activePath = profileB;
    store.update({ soundEnabled: false });

    expect(store.reset()).toEqual({ presentationMode: 'custom', soundEnabled: true });
    expect(fs.existsSync(profileB)).toBe(false);
    activePath = profileA;
    expect(store.get()).toEqual({ presentationMode: 'native', soundEnabled: true });
  });
});
