import { describe, expect, it, vi } from 'vitest';
import { DesktopUpdateDiagnosticsService } from './modules/desktop-update/application/desktop-update-diagnostics';
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

  const desktopUpdateDiagnostics = new DesktopUpdateDiagnosticsService(
    desktopUpdateCoordinator,
    desktopUpdateReceiptStore,
  );
  const runtime = new DesktopMainRuntime(
    windowManager,
    profileRuntimeManager,
    desktopUpdateCoordinator,
    desktopUpdateInstallCoordinator,
    desktopUpdateReceiptStore,
    desktopUpdateDiagnostics,
  );
  const disposeDesktopUpdateIpc = vi.fn();
  runtime.setDesktopUpdateIpcDisposer(disposeDesktopUpdateIpc);

  return {
    runtime,
    deactivateProfile,
    desktopUpdateCoordinator,
    desktopUpdateInstallCoordinator,
    desktopUpdateReceiptStore,
    disposeDesktopUpdateIpc,
  };
}

describe('DesktopMainRuntime Desktop Update ownership', () => {
  it('exposes the process-owned diagnostics service', () => {
    expect(createRuntimeHarness().runtime.desktopUpdateDiagnostics).toBeInstanceOf(
      DesktopUpdateDiagnosticsService,
    );
  });
  it('disposes the process-owned updater during normal process shutdown', async () => {
    const {
      runtime,
      deactivateProfile,
      desktopUpdateCoordinator,
      desktopUpdateInstallCoordinator,
      disposeDesktopUpdateIpc,
    } = createRuntimeHarness();

    await runtime.dispose();

    expect(disposeDesktopUpdateIpc).toHaveBeenCalledTimes(1);
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
      disposeDesktopUpdateIpc,
    } = createRuntimeHarness();

    await runtime.dispose({ preserveDesktopUpdateForHandoff: true });

    expect(disposeDesktopUpdateIpc).toHaveBeenCalledTimes(1);
    expect(desktopUpdateInstallCoordinator.destroy).not.toHaveBeenCalled();
    expect(desktopUpdateCoordinator.destroy).not.toHaveBeenCalled();
    expect(deactivateProfile).toHaveBeenCalledWith({ preserveSelection: true });
  });
});
