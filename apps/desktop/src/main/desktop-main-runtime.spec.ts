import { describe, expect, it, vi } from 'vitest';
import { DesktopMainRuntime } from './desktop-main-runtime';

function createRuntimeHarness() {
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

  return {
    runtime,
    deactivateProfile,
    desktopUpdateCoordinator,
  };
}

describe('DesktopMainRuntime Desktop Update ownership', () => {
  it('disposes the process-owned updater during normal process shutdown', async () => {
    const { runtime, deactivateProfile, desktopUpdateCoordinator } = createRuntimeHarness();

    await runtime.dispose();

    expect(desktopUpdateCoordinator.destroy).toHaveBeenCalledTimes(1);
    expect(deactivateProfile).toHaveBeenCalledWith({ preserveSelection: true });
  });

  it('preserves the updater through update-install cleanup for terminal handoff', async () => {
    const { runtime, deactivateProfile, desktopUpdateCoordinator } = createRuntimeHarness();

    await runtime.dispose({ preserveDesktopUpdateForHandoff: true });

    expect(desktopUpdateCoordinator.destroy).not.toHaveBeenCalled();
    expect(deactivateProfile).toHaveBeenCalledWith({ preserveSelection: true });
  });
});
