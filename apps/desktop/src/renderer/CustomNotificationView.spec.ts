// @vitest-environment happy-dom
import { mount, flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationChannels, RendererEventChannels } from '@memoflow/desktop-contracts';
import { productionLocaleMessages } from '@memoflow/app-vue/locales/production-messages';
import CustomNotificationView from './CustomNotificationView.vue';

const bridge = vi.hoisted(() => ({
  invoke: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  on: vi.fn(),
  off: vi.fn(),
}));
vi.mock('./platform/electron-bridge', () => ({ getElectronBridge: () => bridge }));

function mountView() {
  return mount(CustomNotificationView, {
    global: {
      plugins: [createI18n({ legacy: false, locale: 'zh-CN', messages: productionLocaleMessages })],
    },
  });
}

function receive(data: Record<string, unknown>) {
  bridge.on.mock.calls.find(([channel]) => channel === NotificationChannels.CUSTOM_RECEIVE)![1](
    data,
  );
}

function routineCard() {
  return {
    id: 'routine-card',
    title: 'Stand',
    body: 'Move',
    data: {
      notificationId: 'notification-1',
      workflowKey: 'routine.intervention',
      actions: [
        {
          kind: 'owner-command',
          actionKey: 'complete',
          commandKey: 'routine.complete',
          owner: { type: 'routine-occurrence', id: 'occurrence-1' },
        },
        {
          kind: 'owner-command',
          actionKey: 'snooze-10m',
          commandKey: 'routine.snooze',
          owner: { type: 'routine-occurrence', id: 'occurrence-1' },
        },
      ],
    },
  };
}

describe('custom notification presentation lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.setSystemTime(new Date('2026-11-21T04:00:00Z'));
    bridge.invoke.mockResolvedValue({ ok: true, data: { interaction: { outcome: 'accepted' } } });
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('keeps routine reminders visible and counts elapsed time without marking read', async () => {
    const wrapper = mountView();
    receive(routineCard());
    await nextTick();
    expect(wrapper.text()).toContain('00:00');
    await vi.advanceTimersByTimeAsync(31_000);
    expect(wrapper.text()).toContain('Stand');
    expect(wrapper.text()).toContain('00:31');
    await vi.advanceTimersByTimeAsync(89_000);
    expect(wrapper.text()).toContain('02:00');
    expect(bridge.invoke).not.toHaveBeenCalledWith(
      NotificationChannels.MARK_READ,
      'notification-1',
    );
    expect(bridge.invoke).not.toHaveBeenCalledWith(
      NotificationChannels.CUSTOM_CLOSE,
      'routine-card',
    );
    expect(wrapper.text()).not.toContain('自动标记为已读');
    expect(
      wrapper
        .findAll(
          '[data-testid="notification-read"], [data-testid="notification-complete"], [data-testid="notification-snooze"]',
        )
        .map((button) => button.text()),
    ).toEqual(['', '', '']);
    wrapper.unmount();
  });

  it('dismisses an ordinary notification after 30 seconds without marking read', async () => {
    const wrapper = mountView();
    receive({
      id: 'ordinary',
      title: 'Message',
      body: 'Body',
      data: { notificationId: 'ordinary-id' },
    });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(wrapper.text()).not.toContain('Message');
    expect(bridge.invoke).toHaveBeenCalledWith(NotificationChannels.CUSTOM_CLOSE, 'ordinary');
    expect(bridge.invoke).not.toHaveBeenCalledWith(NotificationChannels.MARK_READ, 'ordinary-id');
    wrapper.unmount();
  });

  it('marks read with Eye before closing without executing a routine action', async () => {
    const wrapper = mountView();
    receive(routineCard());
    await nextTick();
    await wrapper.get('[data-testid="notification-read"]').trigger('click');
    await flushPromises();
    expect(bridge.invoke).toHaveBeenCalledWith(NotificationChannels.MARK_READ, 'notification-1');
    expect(bridge.invoke).toHaveBeenCalledWith(NotificationChannels.CUSTOM_CLOSE, 'routine-card');
    expect(
      bridge.invoke.mock.calls.some(([channel]) => channel === NotificationChannels.EXECUTE_ACTION),
    ).toBe(false);
    expect(wrapper.text()).not.toContain('Stand');
    wrapper.unmount();
  });

  it.each(['read', 'complete'])(
    'keeps the card and error feedback after a rejected %s',
    async (action) => {
      bridge.invoke.mockImplementation(async (channel) =>
        channel === NotificationChannels.MARK_READ ||
        channel === NotificationChannels.EXECUTE_ACTION
          ? { ok: false, error: { message: 'Rejected' } }
          : undefined,
      );
      const wrapper = mountView();
      receive(routineCard());
      await nextTick();
      await wrapper.get('[data-testid="notification-' + action + '"]').trigger('click');
      await flushPromises();
      expect(wrapper.text()).toContain('Stand');
      expect(wrapper.get('[role="alert"]').text()).toContain('操作失败');
      expect(bridge.invoke).not.toHaveBeenCalledWith(
        NotificationChannels.CUSTOM_CLOSE,
        'routine-card',
      );
      wrapper.unmount();
    },
  );

  it('executes Complete before closing', async () => {
    const wrapper = mountView();
    receive(routineCard());
    await nextTick();
    await wrapper.get('[data-testid="notification-complete"]').trigger('click');
    await flushPromises();
    expect(bridge.invoke).toHaveBeenCalledWith(NotificationChannels.EXECUTE_ACTION, {
      notificationId: 'notification-1',
      actionKey: 'complete',
    });
    expect(bridge.invoke).toHaveBeenCalledWith(NotificationChannels.CUSTOM_CLOSE, 'routine-card');
    wrapper.unmount();
  });

  it('offers ten minutes and a custom snooze through the existing action', async () => {
    const wrapper = mountView();
    receive(routineCard());
    await nextTick();
    await wrapper.get('[data-testid="notification-snooze"]').trigger('click');
    expect(wrapper.text()).toContain('10 分钟后提醒');
    await wrapper.get('[data-testid="notification-snooze-minutes"]').setValue('25');
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(bridge.invoke).toHaveBeenCalledWith(NotificationChannels.EXECUTE_ACTION, {
      notificationId: 'notification-1',
      actionKey: 'snooze-10m',
      snoozeDurationMs: 1_500_000,
    });
    expect(bridge.invoke).toHaveBeenCalledWith(NotificationChannels.CUSTOM_CLOSE, 'routine-card');
    wrapper.unmount();
  });

  it('resumes the timestamp clock after visibility changes and clears work on unmount', async () => {
    const interval = vi.spyOn(window, 'setInterval');
    const clearInterval = vi.spyOn(window, 'clearInterval');
    const wrapper = mountView();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(interval).not.toHaveBeenCalled();
    receive(routineCard());
    await nextTick();
    expect(interval).toHaveBeenCalledTimes(1);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(clearInterval).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date(Date.now() + 55_000));
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await nextTick();
    expect(wrapper.text()).toContain('00:55');
    wrapper.unmount();
    await nextTick();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('synchronizes confirmed owner changes, retaining the card on failed reads', async () => {
    const wrapper = mountView();
    receive(routineCard());
    await nextTick();
    const changed = bridge.on.mock.calls.find(
      ([channel]) => channel === RendererEventChannels.DB_CHANGED,
    )![1];
    bridge.invoke.mockImplementation(async (channel) =>
      channel === NotificationChannels.GET
        ? { ok: false, error: { code: 'INTERNAL_ERROR' } }
        : { ok: true, data: null },
    );
    changed({ tables: ['routine_occurrences'] });
    await vi.advanceTimersByTimeAsync(100);
    expect(wrapper.text()).toContain('Stand');
    bridge.invoke.mockImplementation(async (channel) =>
      channel === NotificationChannels.GET
        ? { ok: true, data: { isRead: false, needsAttention: false } }
        : { ok: true, data: null },
    );
    // Recover without requiring another database event.
    await vi.advanceTimersByTimeAsync(5_000);
    expect(wrapper.text()).not.toContain('Stand');
    expect(bridge.invoke).toHaveBeenCalledWith(NotificationChannels.CUSTOM_CLOSE, 'routine-card');
    wrapper.unmount();
  });

  it('keeps an already-read due re-presentation until a new read or owner change', async () => {
    const wrapper = mountView();
    const card = routineCard();
    receive({ ...card, data: { ...card.data, isRead: true, readAt: 100 } });
    await nextTick();
    bridge.invoke.mockImplementation(async (channel) =>
      channel === NotificationChannels.GET
        ? { ok: true, data: { isRead: true, readAt: 100, needsAttention: true } }
        : { ok: true, data: null },
    );
    const changed = bridge.on.mock.calls.find(
      ([channel]) => channel === RendererEventChannels.DB_CHANGED,
    )![1];
    changed({ tables: ['notifications'] });
    await vi.advanceTimersByTimeAsync(100);
    expect(wrapper.text()).toContain('Stand');
    await wrapper.get('[data-testid="notification-open"]').trigger('click');
    expect(bridge.invoke).toHaveBeenCalledWith(NotificationChannels.CUSTOM_CLICK, 'routine-card');
    wrapper.unmount();
  });
});
