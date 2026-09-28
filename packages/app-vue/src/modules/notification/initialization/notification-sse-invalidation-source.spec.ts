import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestServerStateRuntime } from '../../../platform/server-state';
import {
  createNotificationSseInvalidationSource,
  type NotificationSseCursorStore,
} from './notification-sse-invalidation-source';

interface FakeSseEvent {
  data?: string;
  lastEventId?: string;
}

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  close = vi.fn();
  private listeners = new Map<string, Set<(event: FakeSseEvent) => void>>();

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, cb: (event: FakeSseEvent) => void): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(cb);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, cb: (event: FakeSseEvent) => void): void {
    this.listeners.get(type)?.delete(cb);
  }

  emit(type: string, event: FakeSseEvent): void {
    for (const cb of this.listeners.get(type) ?? []) cb(event);
  }
}

function memoryCursorStore(initial?: string): NotificationSseCursorStore & { value?: string } {
  const store: NotificationSseCursorStore & { value?: string } = {
    value: initial,
    get: () => store.value,
    set: (cursor) => {
      store.value = cursor;
    },
  };
  return store;
}

describe('createNotificationSseInvalidationSource (Step 3)', () => {
  let runtime: ReturnType<typeof createTestServerStateRuntime>;
  let invalidate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    runtime = createTestServerStateRuntime();
    invalidate = vi.spyOn(runtime.dispatcher, 'invalidate');
    FakeEventSource.instances = [];
    vi.spyOn(window, 'addEventListener').mockImplementation(() => {});
    vi.spyOn(window, 'removeEventListener').mockImplementation(() => {});
  });

  afterEach(() => {
    runtime.dispose();
    vi.restoreAllMocks();
  });

  function makeSource(
    overrides: Partial<Parameters<typeof createNotificationSseInvalidationSource>[0]> = {},
  ) {
    return createNotificationSseInvalidationSource({
      dispatcher: runtime.dispatcher,
      identityScope: () => 'identity-1',
      url: 'https://example.test/api/v1/notifications/sse',
      cursorStore: memoryCursorStore(),
      eventSource: FakeEventSource as never,
      ...overrides,
    });
  }

  it('parses only minimal metadata from a named event and dispatches an intent', async () => {
    const source = makeSource();
    source.start();

    const es = FakeEventSource.instances[0];
    es.emit('notification', {
      data: JSON.stringify({
        id: 'n-1',
        operationId: 'op-1',
        identityId: 'identity-1',
        title: 'ignored-title',
        body: 'ignored-body',
      }),
      lastEventId: 'cursor-1',
    });
    await Promise.resolve();

    expect(invalidate).toHaveBeenCalledWith({
      target: 'notification',
      identityScope: 'identity-1',
      source: 'sse',
      entityId: 'n-1',
      dedupeKey: 'op-1',
    });
    source.stop();
  });

  it('presents full live InApp deliveries but never replays metadata-only catch-up receipts', async () => {
    const present = vi.fn();
    const source = makeSource({ presentInAppDispatch: present });
    source.start();

    const es = FakeEventSource.instances[0];
    es.emit('notification', {
      data: JSON.stringify({
        id: 'n-live',
        operationId: 'op-live',
        identityId: 'identity-1',
        title: 'Stand & Move',
        body: 'Take a short movement break.',
        category: 'Reminder',
        type: 'Reminder',
      }),
      lastEventId: 'cursor-live',
    });
    es.emit('notification', {
      data: JSON.stringify({
        operationId: 'op-catchup',
        identityId: 'identity-1',
        source: 'notification',
        status: 'succeeded',
      }),
      lastEventId: 'cursor-catchup',
    });
    await Promise.resolve();

    expect(present).toHaveBeenCalledTimes(1);
    expect(present).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'n-live',
        operationId: 'op-live',
        title: 'Stand & Move',
      }),
    );
    source.stop();
  });

  it('persists the last event id to the cursor store', async () => {
    const cursorStore = memoryCursorStore();
    const source = makeSource({ cursorStore });
    source.start();

    FakeEventSource.instances[0].emit('notification', {
      data: JSON.stringify({ id: 'n-1', identityId: 'identity-1' }),
      lastEventId: 'cursor-9',
    });
    await Promise.resolve();

    expect(cursorStore.value).toBe('cursor-9');
    source.stop();
  });

  it('passes the persisted cursor as lastCursor on reconnect/restart', async () => {
    const cursorStore = memoryCursorStore('cursor-42');
    const source = makeSource({ cursorStore });
    source.start();

    expect(FakeEventSource.instances[0].url).toBe(
      'https://example.test/api/v1/notifications/sse?lastCursor=cursor-42',
    );
    source.stop();
  });

  it('fails closed on identity mismatch and on malformed payloads', async () => {
    const source = makeSource();
    source.start();
    const es = FakeEventSource.instances[0];

    es.emit('notification', {
      data: JSON.stringify({ id: 'n-2', identityId: 'identity-other' }),
      lastEventId: 'c-2',
    });
    es.emit('notification', { data: '{not-json', lastEventId: 'c-3' });
    await Promise.resolve();

    expect(invalidate).not.toHaveBeenCalled();
    source.stop();
  });

  it('dispatches a reconnect intent on browser online', async () => {
    const source = makeSource();
    source.start();

    const onlineHandler = (window.addEventListener as ReturnType<typeof vi.fn>).mock.calls.find(
      ([type]) => type === 'online',
    )?.[1] as () => void;
    onlineHandler();
    await Promise.resolve();

    expect(invalidate).toHaveBeenCalledWith({
      target: 'notification',
      identityScope: 'identity-1',
      source: 'reconnect',
    });
    source.stop();
  });

  it('start/stop are idempotent and stop closes the EventSource and removes listeners', async () => {
    const source = makeSource();
    source.start();
    source.start();
    expect(FakeEventSource.instances).toHaveLength(1);

    source.stop();
    source.stop();
    expect(FakeEventSource.instances[0].close).toHaveBeenCalledTimes(1);
    expect(window.removeEventListener).toHaveBeenCalledWith('online', expect.any(Function));

    // No dispatches after stop.
    FakeEventSource.instances[0].emit('notification', {
      data: JSON.stringify({ id: 'n-9', identityId: 'identity-1' }),
    });
    await Promise.resolve();
    expect(invalidate).not.toHaveBeenCalled();
  });
});
