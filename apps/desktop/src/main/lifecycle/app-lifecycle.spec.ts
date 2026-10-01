import { describe, expect, it, vi } from 'vitest';
import { DesktopShutdownCoordinator } from './desktop-shutdown-coordinator';
import { createBeforeQuitHandler } from './before-quit-handler';

function createEvent() {
  return {
    preventDefault: vi.fn(),
  } as unknown as Electron.Event;
}

describe('createBeforeQuitHandler', () => {
  it('blocks normal quit until cleanup settles, then authorizes exactly one final quit', async () => {
    let resolveCleanup: (() => void) | null = null;
    const coordinator = new DesktopShutdownCoordinator({
      cleanup: () =>
        new Promise<void>((resolve) => {
          resolveCleanup = resolve;
        }),
    });
    const quit = vi.fn();
    const handler = createBeforeQuitHandler(coordinator, quit);
    const firstEvent = createEvent();
    const secondEvent = createEvent();

    const first = handler(firstEvent);
    const second = handler(secondEvent);

    expect(firstEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(secondEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(coordinator.currentOwnerReason).toBe('normal-quit');
    expect(quit).not.toHaveBeenCalled();

    resolveCleanup?.();
    await Promise.all([first, second]);

    expect(coordinator.shouldAllowProcessExit).toBe(true);
    expect(quit).toHaveBeenCalledTimes(1);

    const terminalEvent = createEvent();
    await handler(terminalEvent);
    expect(terminalEvent.preventDefault).not.toHaveBeenCalled();
    expect(quit).toHaveBeenCalledTimes(1);
  });

  it('does not steal the terminal action when update-install already owns shutdown', async () => {
    let resolveCleanup: (() => void) | null = null;
    const coordinator = new DesktopShutdownCoordinator({
      cleanup: () =>
        new Promise<void>((resolve) => {
          resolveCleanup = resolve;
        }),
    });
    const updateShutdown = coordinator.request('update-install');
    const quit = vi.fn();
    const handler = createBeforeQuitHandler(coordinator, quit);
    const event = createEvent();

    const normalQuit = handler(event);

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(coordinator.currentOwnerReason).toBe('update-install');

    resolveCleanup?.();
    await updateShutdown;
    await normalQuit;

    expect(coordinator.currentPhase).toBe('settled');
    expect(coordinator.shouldAllowProcessExit).toBe(false);
    expect(quit).not.toHaveBeenCalled();
  });

  it('still terminates a normal quit after failed cleanup, matching the bounded shutdown policy', async () => {
    const coordinator = new DesktopShutdownCoordinator({
      cleanup: vi.fn(async () => {
        throw new Error('cleanup failed');
      }),
    });
    const quit = vi.fn();
    const handler = createBeforeQuitHandler(coordinator, quit);

    await handler(createEvent());

    expect(coordinator.shouldAllowProcessExit).toBe(true);
    expect(quit).toHaveBeenCalledTimes(1);
  });
});
