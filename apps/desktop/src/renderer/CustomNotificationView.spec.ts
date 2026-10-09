// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationChannels } from '@memoflow/contracts/electron';
import CustomNotificationView from './CustomNotificationView.vue';

const bridge = vi.hoisted(() => ({
  invoke: vi.fn(async () => undefined),
  on: vi.fn(),
  off: vi.fn(),
}));
vi.mock('./platform/electron-bridge', () => ({ getElectronBridge: () => bridge }));

describe('custom notification presentation lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('runs the countdown only while a visible notification needs it and clears scheduled work on unmount', async () => {
    const interval = vi.spyOn(window, 'setInterval');
    const clearInterval = vi.spyOn(window, 'clearInterval');
    const wrapper = mount(CustomNotificationView);
    await nextTick();
    expect(interval).not.toHaveBeenCalled();
    // Settle Vue's development-only devtools discovery timeout.
    await vi.advanceTimersByTimeAsync(3_000);
    const receive = bridge.on.mock.calls.find(
      ([channel]) => channel === NotificationChannels.CUSTOM_RECEIVE,
    )![1];
    receive({ id: 'toast-1', title: 'Reminder', body: 'Body', sound: false });
    await nextTick();
    expect(wrapper.text()).toContain('Reminder');
    expect(interval).toHaveBeenCalledTimes(1);

    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(clearInterval).toHaveBeenCalledTimes(1);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(interval).toHaveBeenCalledTimes(2);
    await wrapper.get('button').trigger('click');
    await nextTick();
    expect(clearInterval).toHaveBeenCalledTimes(2);
    wrapper.unmount();
    await nextTick();
    expect(vi.getTimerCount()).toBe(0);
  });
});
