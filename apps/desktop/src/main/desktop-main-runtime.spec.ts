import { describe, expect, it, vi } from 'vitest';
import { DesktopMainRuntime } from './desktop-main-runtime';

describe('DesktopMainRuntime Desktop Update ownership', () => {
  it('disposes the process-owned updater only with the main runtime', async () => {
    const deactivateProfile = vi.fn(async () => undefined);
    const profileRuntimeManager = {
      getActiveProfileAccessContext: vi.fn(() => null),
      deactivateProfile,
    } as unknown as ConstructorParameters<typeof DesktopMainRuntime>[1];
    const desktopUpdateCoordinator = {
      destroy: vi.fn(),
    } as unknown as ConstructorParameters<typeof DesktopMainRuntime>[2];
    const windowManager = {} as ConstructorParameters<typeof DesktopMainRuntime>[0];

    const runtime = new DesktopMainRuntime(
      windowManager,
      profileRuntimeManager,
      desktopUpdateCoordinator,
    );

    await runtime.dispose();

    expect(desktopUpdateCoordinator.destroy).toHaveBeenCalledTimes(1);
    expect(deactivateProfile).toHaveBeenCalledWith({ preserveSelection: true });
  });
});
