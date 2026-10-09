import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as powersyncPublic from '../index';

const handles = vi.hoisted(() => ({
  close: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@powersync/node', () => ({
  PowerSyncDatabase: class {
    waitForReady = async () => undefined;
    onChange = () => () => undefined;
    disconnect = handles.disconnect;
    close = handles.close;
  },
}));

describe('desktop PowerSync public surface', () => {
  it('closes the old database worker before another Profile opens', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-db-close-'));
    try {
      await powersyncPublic.openPowerSyncLocalOnly(path.join(root, 'one.sqlite'));
      await powersyncPublic.shutdownPowerSync();
      expect(handles.close).toHaveBeenCalledOnce();
      expect(powersyncPublic.getPowerSyncDatabase()).toBeNull();
      await powersyncPublic.openPowerSyncLocalOnly(path.join(root, 'two.sqlite'));
      await powersyncPublic.shutdownPowerSync();
      expect(handles.close).toHaveBeenCalledTimes(2);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
  it('exposes only the profile-runtime entrypoints (no dual-track connect/promote/wipe shims)', () => {
    expect(Object.keys(powersyncPublic).sort()).toEqual(
      [
        'ensurePowerSyncSyncMode',
        'getPowerSyncDatabase',
        'openPowerSyncLocalOnly',
        'shutdownPowerSync',
      ].sort(),
    );
    expect(powersyncPublic).not.toHaveProperty('connectPowerSync');
    expect(powersyncPublic).not.toHaveProperty('disconnectPowerSync');
    expect(powersyncPublic).not.toHaveProperty('promotePowerSyncToSync');
  });
});
