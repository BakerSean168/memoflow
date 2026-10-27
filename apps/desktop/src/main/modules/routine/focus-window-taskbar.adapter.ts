import type { BrowserWindow } from 'electron';
import type { FocusWindowProjection } from '@memoflow/desktop-contracts';
import type { FocusTaskbarIntegrationPort } from './focus-window-controller';

/** Optional Electron taskbar progress adapter; no domain state is stored here. */
export class ElectronFocusTaskbarAdapter implements FocusTaskbarIntegrationPort {
  constructor(private readonly getWindow: () => BrowserWindow | null) {}

  update(projection: FocusWindowProjection): void {
    const window = this.getWindow();
    if (!window || window.isDestroyed()) return;
    if (
      projection.state !== 'Running' ||
      projection.phaseDurationMs == null ||
      projection.remainingMs == null ||
      projection.phaseDurationMs <= 0
    ) {
      window.setProgressBar(-1);
      return;
    }
    const elapsed = Math.max(0, projection.phaseDurationMs - projection.remainingMs);
    window.setProgressBar(Math.min(1, elapsed / projection.phaseDurationMs));
  }

  clear(): void {
    const window = this.getWindow();
    if (window && !window.isDestroyed()) window.setProgressBar(-1);
  }
}
