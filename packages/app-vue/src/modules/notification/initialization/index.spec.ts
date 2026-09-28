import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTypedEventPublisher } from '@memoflow/utils/domain';
import { eventBus } from '@memoflow/utils/domain';
import type {
  NotificationDispatchInAppEvent,
  NotificationEventMap,
} from '@memoflow/contracts/notification';
import { createTestServerStateRuntime } from '../../../platform/server-state';
import { createNotificationStartupHook } from './index';

const publisher =
  createTypedEventPublisher<Pick<NotificationEventMap, 'notification:dispatch_in_app'>>(eventBus);

function makeEvent(
  overrides: Partial<NotificationDispatchInAppEvent> = {},
): NotificationDispatchInAppEvent {
  return {
    id: 'n-1' as NotificationDispatchInAppEvent['id'],
    identityId: 'identity-1' as NotificationDispatchInAppEvent['identityId'],
    title: 'Hi',
    body: 'Body',
    category: 'System',
    type: 'Info',
    importance: 'Moderate',
    ...overrides,
  } as NotificationDispatchInAppEvent;
}

describe('createNotificationStartupHook (eventBus → presentation + dispatcher)', () => {
  let runtime: ReturnType<typeof createTestServerStateRuntime>;

  beforeEach(() => {
    runtime = createTestServerStateRuntime();
  });

  afterEach(() => {
    runtime.dispose();
    vi.restoreAllMocks();
  });

  it('dispatches a typed invalidation intent (entityId + operationId dedupeKey) without touching stores', async () => {
    const hook = createNotificationStartupHook({
      dispatcher: runtime.dispatcher,
      identityScope: () => 'identity-1',
    });
    const invalidate = vi.spyOn(runtime.dispatcher, 'invalidate');
    hook.start();

    publisher.send('notification:dispatch_in_app', makeEvent({ operationId: 'op-1' }));
    await Promise.resolve();

    expect(invalidate).toHaveBeenCalledWith({
      target: 'notification',
      identityScope: 'identity-1',
      source: 'event-bus',
      entityId: 'n-1',
      dedupeKey: 'op-1',
    });
    hook.stop();
  });

  it('offers an identity-matched InApp dispatch to the optional host presentation without replacing invalidation', async () => {
    const present = vi.fn();
    const hook = createNotificationStartupHook({
      dispatcher: runtime.dispatcher,
      identityScope: () => 'identity-1',
      presentInAppDispatch: present,
    });
    const invalidate = vi.spyOn(runtime.dispatcher, 'invalidate');
    hook.start();

    const event = makeEvent({ operationId: 'op-present' });
    publisher.send('notification:dispatch_in_app', event);
    await Promise.resolve();

    expect(present).toHaveBeenCalledWith(event);
    expect(invalidate).toHaveBeenCalledTimes(1);
    hook.stop();
  });

  it('contains presentation failures so Notification Inbox invalidation still proceeds', async () => {
    const hook = createNotificationStartupHook({
      dispatcher: runtime.dispatcher,
      identityScope: () => 'identity-1',
      presentInAppDispatch: () => {
        throw new Error('device surface unavailable');
      },
    });
    const invalidate = vi.spyOn(runtime.dispatcher, 'invalidate');
    hook.start();

    publisher.send('notification:dispatch_in_app', makeEvent({ operationId: 'op-fallback' }));
    await Promise.resolve();

    expect(invalidate).toHaveBeenCalledWith(expect.objectContaining({ dedupeKey: 'op-fallback' }));
    hook.stop();
  });

  it('falls back to the event id as dedupeKey when no operationId is present', async () => {
    const hook = createNotificationStartupHook({
      dispatcher: runtime.dispatcher,
      identityScope: () => 'identity-1',
    });
    const invalidate = vi.spyOn(runtime.dispatcher, 'invalidate');
    hook.start();

    publisher.send('notification:dispatch_in_app', makeEvent({ operationId: undefined }));
    await Promise.resolve();

    expect(invalidate).toHaveBeenCalledWith(expect.objectContaining({ dedupeKey: 'n-1' }));
    hook.stop();
  });

  it('fails closed on identity mismatch (never invalidates another identity)', async () => {
    const hook = createNotificationStartupHook({
      dispatcher: runtime.dispatcher,
      identityScope: () => 'identity-1',
    });
    const invalidate = vi.spyOn(runtime.dispatcher, 'invalidate');
    hook.start();

    publisher.send(
      'notification:dispatch_in_app',
      makeEvent({ identityId: 'identity-other' as NotificationDispatchInAppEvent['identityId'] }),
    );
    await Promise.resolve();

    expect(invalidate).not.toHaveBeenCalled();
    hook.stop();
  });

  it('fails closed on empty identity', async () => {
    const hook = createNotificationStartupHook({
      dispatcher: runtime.dispatcher,
      identityScope: () => '',
    });
    const invalidate = vi.spyOn(runtime.dispatcher, 'invalidate');
    hook.start();

    publisher.send('notification:dispatch_in_app', makeEvent());
    await Promise.resolve();

    expect(invalidate).not.toHaveBeenCalled();
    hook.stop();
  });

  it('start/stop are idempotent and stop removes the listener (zero dispatches after stop)', async () => {
    const hook = createNotificationStartupHook({
      dispatcher: runtime.dispatcher,
      identityScope: () => 'identity-1',
    });
    const invalidate = vi.spyOn(runtime.dispatcher, 'invalidate');

    hook.start();
    hook.start(); // idempotent
    publisher.send('notification:dispatch_in_app', makeEvent({ id: 'n-1' as never }));
    await Promise.resolve();
    expect(invalidate).toHaveBeenCalledTimes(1);

    hook.stop();
    hook.stop(); // idempotent
    publisher.send('notification:dispatch_in_app', makeEvent({ id: 'n-2' as never }));
    await Promise.resolve();
    expect(invalidate).toHaveBeenCalledTimes(1);

    // Restart works again.
    hook.start();
    publisher.send('notification:dispatch_in_app', makeEvent({ id: 'n-3' as never }));
    await Promise.resolve();
    expect(invalidate).toHaveBeenCalledTimes(2);
    hook.stop();
  });
});
