/**
 * Startup in-app notice bridge (main → renderer).
 *
 * The desktop main process occasionally needs to tell the renderer something
 * before the Vue app has mounted (for example: the tray capability degraded on
 * Windows). A notice must not use a native message box, and `webContents.send`
 * before the renderer registered its listener would be lost.
 *
 * This bridge follows the existing ready-then-flush pattern of the custom
 * notification renderer: the renderer invokes {@link SystemChannels.SYSTEM_NOTICE_READY}
 * once its toast host is mounted, and main replays everything queued for that
 * sender. Repeating readiness only acknowledges an empty queue, so a notice is
 * shown at most once. When no live window exists the notice is logged and
 * dropped — startup is never blocked.
 */
import { ipcMain, type BrowserWindow } from 'electron';
import {
  RendererEventChannels,
  SystemChannels,
  type SystemNotice,
  type SystemNoticeReadyResult,
} from '@memoflow/desktop-contracts';
import { createLogger } from '@memoflow/utils/logger';

const logger = createLogger('SystemNoticeBridge');

export class SystemNoticeBridge {
  private readonly readySenders = new Set<number>();
  private readonly pending = new Map<number, SystemNotice[]>();

  /** Register the readiness handler. Safe to call again in tests. */
  register(): void {
    this.readySenders.clear();
    this.pending.clear();
    ipcMain.removeHandler(SystemChannels.SYSTEM_NOTICE_READY);
    ipcMain.handle(SystemChannels.SYSTEM_NOTICE_READY, (event): SystemNoticeReadyResult => {
      const sender = event.sender;
      this.readySenders.add(sender.id);
      const queued = this.pending.get(sender.id) ?? [];
      if (!queued.length) return { delivered: [] };
      this.pending.delete(sender.id);
      for (const notice of queued) sender.send(RendererEventChannels.SYSTEM_NOTICE, notice);
      logger.info('Delivered queued system notices', {
        senderId: sender.id,
        ids: queued.map((notice) => notice.id),
      });
      return { delivered: queued.map((notice) => notice.id) };
    });
  }

  /**
   * Queue a notice for the window's renderer, or send it now when that renderer
   * already reported readiness. Returns whether it was delivered immediately.
   */
  publish(window: BrowserWindow, notice: SystemNotice): boolean {
    if (window.isDestroyed() || window.webContents.isDestroyed()) {
      logger.warn('Dropping system notice: no live renderer', { id: notice.id });
      return false;
    }
    const sender = window.webContents;
    if (this.readySenders.has(sender.id)) {
      sender.send(RendererEventChannels.SYSTEM_NOTICE, notice);
      return true;
    }
    const queued = this.pending.get(sender.id) ?? [];
    if (!queued.some((entry) => entry.id === notice.id)) queued.push(notice);
    this.pending.set(sender.id, queued);
    return false;
  }

  dispose(): void {
    ipcMain.removeHandler(SystemChannels.SYSTEM_NOTICE_READY);
    this.readySenders.clear();
    this.pending.clear();
  }
}
