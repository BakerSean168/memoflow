/** @vitest-environment happy-dom */

import { flushPromises, mount } from '@vue/test-utils';
import { VueQueryPlugin } from '@tanstack/vue-query';
import { Bell } from '@lucide/vue';
import { createPinia } from 'pinia';
import { h } from 'vue';
import { createI18n } from 'vue-i18n';
import { expect, it, vi } from 'vitest';
import { ok } from '@memoflow/contracts/result';
import { NOTIFICATION_SERVICE_KEY } from '../../di/keys';
import NotificationCapsulePreview from '../../modules/notification/components/NotificationCapsulePreview.vue';
import {
  createServerStateRuntime,
  SERVER_STATE_IDENTITY_SCOPE_KEY,
  SERVER_STATE_RUNTIME_KEY,
} from '../../platform/server-state';
import ModuleCapsule from './ModuleCapsule.vue';

it('reuses the notification owner queries through hover, pin and keyboard reopen', async () => {
  vi.useFakeTimers();
  const runtime = createServerStateRuntime('web');
  const result = ok({ notifications: [], total: 0, page: 1, pageSize: 10, hasMore: false });
  let release!: () => void;
  const findNotifications = vi.fn(
    () => new Promise<typeof result>((resolve) => (release = () => resolve(result))),
  );
  const getUnreadCount = vi.fn().mockResolvedValue(ok({ count: 0 }));
  const wrapper = mount(ModuleCapsule, {
    attachTo: document.body,
    props: { id: 'notification', label: 'Notifications', route: '/notifications', icon: Bell },
    slots: {
      default: () => h(NotificationCapsulePreview),
    },
    global: {
      plugins: [
        createPinia(),
        [VueQueryPlugin, { queryClient: runtime.queryClient }],
        createI18n({
          legacy: false,
          locale: 'en-US',
          messages: {
            'en-US': {
              shell: { previewModule: 'Preview {name}' },
              notification: {
                empty: 'No notifications',
                drawer: { title: 'Notification Center', viewAll: 'View all notifications' },
              },
            },
          },
        }),
      ],
      provide: {
        [NOTIFICATION_SERVICE_KEY as symbol]: { findNotifications, getUnreadCount },
        [SERVER_STATE_RUNTIME_KEY]: runtime,
        [SERVER_STATE_IDENTITY_SCOPE_KEY]: () => 'owner',
      },
    },
  });
  try {
    const navigation = wrapper.get('[data-testid="capsule-nav-notification"]');
    const preview = wrapper.get('[data-testid="capsule-preview-notification"]');
    const ownerPreview = () =>
      document.querySelector('[data-testid="notification-capsule-preview"]');

    await navigation.trigger('click');
    expect(wrapper.emitted('open')).toEqual([[{ id: 'notification', route: '/notifications' }]]);
    expect(ownerPreview()).toBeNull();
    expect(findNotifications).not.toHaveBeenCalled();
    expect(getUnreadCount).not.toHaveBeenCalled();

    await preview.trigger('mouseenter');
    await vi.advanceTimersByTimeAsync(300);
    await flushPromises();
    expect(ownerPreview()).not.toBeNull();
    expect(findNotifications).toHaveBeenCalledExactlyOnceWith({ page: 1, limit: 10 });
    expect(getUnreadCount).toHaveBeenCalledTimes(1);
    expect(wrapper.emitted('open')).toHaveLength(1);

    await preview.trigger('click');
    await preview.trigger('mouseleave');
    await vi.advanceTimersByTimeAsync(200);
    expect(preview.attributes('aria-expanded')).toBe('true');

    // Direct navigation also dismisses an open owner preview.
    await navigation.trigger('click');
    await flushPromises();
    expect(ownerPreview()).toBeNull();
    expect(wrapper.emitted('open')).toHaveLength(2);

    // Reopening while the list request is pending must reuse that request.
    await preview.trigger('click', { detail: 0 });
    await flushPromises();
    expect(findNotifications).toHaveBeenCalledTimes(1);
    expect(getUnreadCount).toHaveBeenCalledTimes(1);
    release();
    await flushPromises();
    await vi.advanceTimersByTimeAsync(0);
    expect(ownerPreview()?.textContent).toContain('No notifications');

    const footer = document.querySelector<HTMLButtonElement>(
      '[data-testid="notification-capsule-view-all"]',
    )!;
    expect(document.activeElement).toBe(footer);
    footer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await flushPromises();
    expect(preview.attributes('aria-expanded')).toBe('false');
    expect(ownerPreview()).toBeNull();
    expect(document.activeElement).toBe(preview.element);

    // A fresh-cache remount renders the real owner without another list/unread fetch.
    await preview.trigger('click', { detail: 0 });
    await flushPromises();
    expect(ownerPreview()?.textContent).toContain('No notifications');
    expect(findNotifications).toHaveBeenCalledTimes(1);
    expect(getUnreadCount).toHaveBeenCalledTimes(1);
    expect(wrapper.emitted('open')).toHaveLength(2);
  } finally {
    wrapper.unmount();
    runtime.dispose();
    vi.useRealTimers();
  }
});
