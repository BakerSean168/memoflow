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
  const desktopUpdateInstallCoordinator = {
    destroy: vi.fn(),
  } as unknown as ConstructorParameters<typeof DesktopMainRuntime>[3];
  const desktopUpdateReceiptStore = {
    read: vi.fn(async () => null),
    write: vi.fn(async () => undefined),
    clear: vi.fn(async () => undefined),
  } as unknown as ConstructorParameters<typeof DesktopMainRuntime>[4];
  const windowManager = {} as ConstructorParameters<typeof DesktopMainRuntime>[0];

  const runtime = new DesktopMainRuntime(
    windowManager,
    profileRuntimeManager,
    desktopUpdateCoordinator,
    desktopUpdateInstallCoordinator,
    desktopUpdateReceiptStore,
  );

  return {
    runtime,
    deactivateProfile,
    desktopUpdateCoordinator,
    desktopUpdateInstallCoordinator,
    desktopUpdateReceiptStore,
  };
}

describe('DesktopMainRuntime Desktop Update ownership', () => {
  it('disposes the process-owned updater during normal process shutdown', async () => {
    const {
      runtime,
      deactivateProfile,
      desktopUpdateCoordinator,
      desktopUpdateInstallCoordinator,
    } = createRuntimeHarness();

    await runtime.dispose();

    expect(desktopUpdateInstallCoordinator.destroy).toHaveBeenCalledTimes(1);
    expect(desktopUpdateCoordinator.destroy).toHaveBeenCalledTimes(1);
    expect(deactivateProfile).toHaveBeenCalledWith({ preserveSelection: true });
  });

  it('preserves the updater through update-install cleanup for terminal handoff', async () => {
    const {
      runtime,
      deactivateProfile,
      desktopUpdateCoordinator,
      desktopUpdateInstallCoordinator,
    } = createRuntimeHarness();

    await runtime.dispose({ preserveDesktopUpdateForHandoff: true });

    expect(desktopUpdateInstallCoordinator.destroy).not.toHaveBeenCalled();
    expect(desktopUpdateCoordinator.destroy).not.toHaveBeenCalled();
    expect(deactivateProfile).toHaveBeenCalledWith({ preserveSelection: true });
  });
});
