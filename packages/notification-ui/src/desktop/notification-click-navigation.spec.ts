import { describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { RendererEventChannels } from '@memoflow/contracts/electron';
import {
  createNotificationClickNavigation,
  hasNotificationExternalDestination,
  resolveNotificationDestination,
} from './notification-click-navigation';

function makeRouter() {
  const EmptyRoute = { template: '<div />' };
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: EmptyRoute },
      { path: '/goals', component: EmptyRoute },
      { path: '/goals/:id', component: EmptyRoute },
      { path: '/notifications', component: EmptyRoute },
      { path: '/schedule', component: EmptyRoute },
      { path: '/tasks', component: EmptyRoute },
      { path: '/tasks/:id', component: EmptyRoute },
    ],
  });
}

function makeBridge() {
  const handlers = new Map<string, Array<(...args: unknown[]) => void>>();
  return {
    invoke: vi.fn(async () => undefined),
    on: vi.fn((channel: string, cb: (...args: unknown[]) => void) => {
      handlers.set(channel, [...(handlers.get(channel) ?? []), cb]);
    }),
    off: vi.fn((channel: string, cb: (...args: unknown[]) => void) => {
      handlers.set(
        channel,
        (handlers.get(channel) ?? []).filter((handler) => handler !== cb),
      );
    }),
    emit: (channel: string, ...args: unknown[]) => {
      for (const handler of handlers.get(channel) ?? []) handler(...args);
    },
  };
}

describe('shared Notification click destination policy', () => {
  it('uses an explicit intent first and preserves its params as query', async () => {
    const router = makeRouter();
    const bridge = makeBridge();
    const navigation = createNotificationClickNavigation(router, () => bridge as never);
    navigation.start();

    bridge.emit(RendererEventChannels.NOTIFICATION_CLICKED, {
      notificationId: 'n-1',
      category: 'Task',
      navigationIntent: { route: '/goals/g-1', params: { tab: 'review' } },
    });

    await router.isReady();
    expect(router.currentRoute.value.path).toBe('/goals/g-1');
    expect(router.currentRoute.value.query).toEqual({ tab: 'review' });
    expect(
      resolveNotificationDestination({
        navigationIntent: { route: '/goals/g-1', params: { tab: 'review' } },
      }),
    ).toEqual({ path: '/goals/g-1', query: { tab: 'review' } });
  });

  it.each([
    ['Task', '/tasks'],
    [' task ', '/tasks'],
    ['GOAL', '/goals'],
    ['Schedule', '/schedule'],
  ])('normalizes category %s to %s', (category, path) => {
    expect(resolveNotificationDestination({ category })).toEqual({ path });
    expect(hasNotificationExternalDestination({ category })).toBe(true);
  });

  it('keeps unknown, retired Reminder, Account, and System notifications in Notification Center', () => {
    for (const category of [undefined, 'Unknown', 'Reminder', 'Account', 'System']) {
      expect(resolveNotificationDestination({ category })).toEqual({ path: '/notifications' });
      expect(hasNotificationExternalDestination({ category })).toBe(false);
    }
  });

  it('contains desktop navigation failures', async () => {
    const router = makeRouter();
    const bridge = makeBridge();
    const navigation = createNotificationClickNavigation(router, () => bridge as never);
    navigation.start();
    vi.spyOn(router, 'push').mockRejectedValueOnce(new Error('internal route detail'));

    expect(() =>
      bridge.emit(RendererEventChannels.NOTIFICATION_CLICKED, {
        notificationId: 'n-fail',
        category: 'Task',
      }),
    ).not.toThrow();
    await Promise.resolve();
  });

  it('stops listening after stop()', () => {
    const router = makeRouter();
    const bridge = makeBridge();
    const navigation = createNotificationClickNavigation(router, () => bridge as never);
    navigation.start();
    navigation.stop();

    expect(bridge.off).toHaveBeenCalledWith(
      RendererEventChannels.NOTIFICATION_CLICKED,
      expect.any(Function),
    );
  });
});
