import { RendererEventChannels } from '@memoflow/desktop-contracts';
import type { ElectronBridge } from '@memoflow/ipc-client';
import type { Router } from 'vue-router';

/** Main sends only an action, never an arbitrary renderer route. Preload strips the IPC event. */
export function registerTrayNavigation(
  bridge: Pick<ElectronBridge, 'on' | 'off'>,
  router: Pick<Router, 'push'>,
  canAccess: () => boolean,
): () => void {
  const onAction = (action: unknown) => {
    if (action === 'settings' && canAccess()) {
      void router
        .push('/settings')
        .catch((error) => console.error('Could not open settings', error));
    }
  };
  bridge.on(RendererEventChannels.TRAY_ACTION, onAction);
  return () => bridge.off(RendererEventChannels.TRAY_ACTION, onAction);
}
