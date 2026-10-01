import type { DesktopShutdownCoordinator } from './desktop-shutdown-coordinator';

export interface BeforeQuitEvent {
  preventDefault(): void;
}

/**
 * Sole bridge from Electron's before-quit event into the shared shutdown owner.
 *
 * The bridge blocks process exit until cleanup settles. If update-install owns
 * shutdown, it deliberately does not perform the terminal quit: the updater
 * handoff path must authorize that exit itself.
 */
export function createBeforeQuitHandler(
  shutdownCoordinator: DesktopShutdownCoordinator,
  quit: () => void,
): (event: BeforeQuitEvent) => Promise<void> {
  return async (event: BeforeQuitEvent): Promise<void> => {
    if (shutdownCoordinator.shouldAllowProcessExit) return;

    event.preventDefault();
    console.log('[Lifecycle] Cleaning up before quit...');

    const settlement = await shutdownCoordinator.request('normal-quit');

    if (settlement.reason !== 'normal-quit') {
      console.log('[Lifecycle] Quit deferred to update-install owner');
      return;
    }

    if (shutdownCoordinator.shouldAllowProcessExit) return;

    shutdownCoordinator.beginTerminalExit('normal-quit');
    console.log(`[Lifecycle] Cleanup ${settlement.status}, quitting...`);
    quit();
  };
}
