/**
 * Renderer side of the desktop system-notice bridge.
 *
 * Main queues notices until a renderer reports readiness; this helper registers
 * the listener and then signals readiness, so a notice emitted during startup
 * (tray capability degraded) is replayed after the toast host is mounted.
 * Localized text lives here, not in main.
 */
import {
  RendererEventChannels,
  SystemChannels,
  SystemNoticeSchema,
  type SystemNoticeId,
} from '@memoflow/desktop-contracts';
import { toast } from 'vue-sonner';
import type { ElectronBridge } from '@memoflow/ipc-client';

const SYSTEM_NOTICE_MESSAGE_KEYS: Record<SystemNoticeId, string> = {
  'tray-unavailable': 'shell.systemNotice.trayUnavailable',
};

export function registerSystemNotice(
  bridge: Pick<ElectronBridge, 'on' | 'off' | 'invoke'>,
  translate: (key: string) => string,
): () => void {
  const shown = new Set<SystemNoticeId>();
  const onNotice = (payload: unknown) => {
    const parsed = SystemNoticeSchema.safeParse(payload);
    if (!parsed.success) return;
    const { id } = parsed.data;
    // Main clears its queue after delivery; this guards in-renderer remounts too.
    if (shown.has(id)) return;
    shown.add(id);
    toast.warning(translate(SYSTEM_NOTICE_MESSAGE_KEYS[id]), { duration: 6000 });
  };

  bridge.on(RendererEventChannels.SYSTEM_NOTICE, onNotice);
  void Promise.resolve(bridge.invoke(SystemChannels.SYSTEM_NOTICE_READY)).catch((error) => {
    console.warn('[desktop] Could not report system notice readiness', error);
  });

  return () => bridge.off(RendererEventChannels.SYSTEM_NOTICE, onNotice);
}
