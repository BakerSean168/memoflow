import { expect, it, vi } from 'vitest';
import { RendererEventChannels } from '@memoflow/desktop-contracts';
import { ALLOWED_CHANNELS } from '../../preload/allowed-channels';
import { registerTrayNavigation } from './tray-navigation';

it('navigates the settings action through a whitelisted preload event, guards the Profile, and unsubscribes', async () => {
  const bridge = { on: vi.fn(), off: vi.fn() };
  const router = { push: vi.fn(async () => undefined) };
  let unlocked = true;
  const stop = registerTrayNavigation(bridge, router, () => unlocked);
  expect(ALLOWED_CHANNELS).toContain(RendererEventChannels.TRAY_ACTION);
  const [channel, callback] = bridge.on.mock.calls[0];
  expect(channel).toBe(RendererEventChannels.TRAY_ACTION);
  const action = callback as (action: unknown) => void;
  action('settings');
  expect(router.push).toHaveBeenCalledExactlyOnceWith('/settings');
  unlocked = false;
  action('settings');
  unlocked = true;
  action('/arbitrary');
  expect(router.push).toHaveBeenCalledTimes(1);
  stop();
  expect(bridge.off).toHaveBeenCalledWith(channel, callback);
});
