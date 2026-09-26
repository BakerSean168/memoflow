/**
 * Auto Launch characterization tests.
 *
 * Locks the current AutoLaunchManager behavior so the capability ownership
 * migration cannot change it silently:
 * - non-macOS (Windows/Linux) dynamically imports the `auto-launch` library and
 *   degrades gracefully when the provider is unavailable;
 * - macOS uses the native Electron login-item APIs.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from 'electron';
import { AutoLaunchManager } from './auto-launch-manager';

// Shared controller for the mocked `auto-launch` module so the test body can
// emulate both the available and the degraded provider.
const harness = {
  forceFail: false,
  instances: [] as Array<{
    config: { name: string; path: string; isHidden?: boolean };
    on: boolean;
  }>,
  reset(): void {
    this.forceFail = false;
    this.instances.length = 0;
  },
};

vi.mock('auto-launch', () => {
  class FakeAutoLaunch {
    constructor(
      readonly config: { name: string; path: string; isHidden?: boolean },
    ) {
      if (harness.forceFail) {
        throw new Error('auto-launch unavailable');
      }
      harness.instances.push({ config, on: false });
    }

    isEnabled(): Promise<boolean> {
      return Promise.resolve(harness.instances.at(-1)!.on);
    }

    enable(): Promise<void> {
      harness.instances.at(-1)!.on = true;
      return Promise.resolve();
    }

    disable(): Promise<void> {
      harness.instances.at(-1)!.on = false;
      return Promise.resolve();
    }
  }
  return { __esModule: true, default: FakeAutoLaunch };
});

describe('AutoLaunchManager (non-macOS auto-launch provider)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    harness.reset();
  });

  it('defaults the launch name to MemoFlow and isHidden to true', async () => {
    const manager = new AutoLaunchManager();
    await manager.init();
    const instance = harness.instances.at(-1);
    expect(instance).toBeDefined();
    expect(instance!.config.name).toBe('MemoFlow');
    expect(instance!.config.isHidden).toBe(true);
    expect(instance!.config.path).toBe(app.getPath('exe'));
  });

  it('honors custom name and isHidden configuration', async () => {
    const manager = new AutoLaunchManager({ name: 'Custom App', isHidden: false });
    await manager.init();
    const instance = harness.instances.at(-1);
    expect(instance!.config.name).toBe('Custom App');
    expect(instance!.config.isHidden).toBe(false);
  });

  it('isEnabled is false before init when no provider exists', async () => {
    const manager = new AutoLaunchManager();
    expect(await manager.isEnabled()).toBe(false);
  });

  it('init on non-macOS instantiates the auto-launch provider', async () => {
    const manager = new AutoLaunchManager();
    await manager.init();
    expect(harness.instances).toHaveLength(1);
  });

  it('enable() delegates to the auto-launch provider and returns true', async () => {
    const manager = new AutoLaunchManager();
    await manager.init();
    expect(await manager.enable()).toBe(true);
    expect(harness.instances.at(-1)!.on).toBe(true);
  });

  it('disable() delegates to the auto-launch provider and returns true', async () => {
    const manager = new AutoLaunchManager();
    await manager.init();
    await manager.enable();
    expect(await manager.disable()).toBe(true);
    expect(harness.instances.at(-1)!.on).toBe(false);
  });

  it('gracefully degrades when the auto-launch provider cannot be constructed', async () => {
    harness.forceFail = true;
    const manager = new AutoLaunchManager();
    await expect(manager.init()).resolves.toBeUndefined();
    expect(await manager.isEnabled()).toBe(false);
    expect(await manager.enable()).toBe(false);
    expect(await manager.disable()).toBe(false);
  });
});

describe('AutoLaunchManager (macOS native login-item APIs)', () => {
  let originalPlatform: string;

  beforeAll(() => {
    originalPlatform = process.platform;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    harness.reset();
  });

  afterAll(() => {
    restorePlatform();
    harness.reset();
  });

  function setDarwin(): void {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
  }

  function restorePlatform(): void {
    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
  }

  it('isEnabled derives openAtLogin from getLoginItemSettings', async () => {
    setDarwin();
    try {
      vi.mocked(app.getLoginItemSettings).mockReturnValueOnce({ openAtLogin: true });
      const manager = new AutoLaunchManager();
      expect(await manager.isEnabled()).toBe(true);
    } finally {
      restorePlatform();
    }
  });

  it('enable sets openAtLogin true on macOS', async () => {
    setDarwin();
    try {
      const manager = new AutoLaunchManager({ isHidden: true });
      expect(await manager.enable()).toBe(true);
      expect(app.setLoginItemSettings).toHaveBeenCalledWith({
        openAtLogin: true,
      });
    } finally {
      restorePlatform();
    }
  });

  it('disable sets openAtLogin false', async () => {
    setDarwin();
    try {
      const manager = new AutoLaunchManager();
      expect(await manager.disable()).toBe(true);
      expect(app.setLoginItemSettings).toHaveBeenCalledWith({ openAtLogin: false });
    } finally {
      restorePlatform();
    }
  });

  it('init on macOS does not load the auto-launch provider', async () => {
    setDarwin();
    try {
      const manager = new AutoLaunchManager();
      await manager.init();
      expect(harness.instances).toHaveLength(0);
    } finally {
      restorePlatform();
    }
  });
});
