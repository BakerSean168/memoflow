import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryObserver } from '@tanstack/vue-query';
import type { QueryKey } from '@tanstack/vue-query';
import { createTestServerQueryClient } from './query-client';
import {
  createServerStateInvalidationDispatcher,
  type ServerStateInvalidation,
} from './invalidation-dispatcher';
import { governanceQueryKeys, notificationQueryKeys, taskTemplateQueryKeys } from './query-keys';

/** Wait for the current microtask turn so dispatcher turn-batching flushes. */
async function flushTurn(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function observeActive(
  queryClient: QueryClient,
  queryKey: QueryKey,
  queryFn: () => Promise<unknown>,
): { unsubscribe: () => void } {
  const observer = new QueryObserver(queryClient, { queryKey, queryFn });
  observer.subscribe(() => {});
  return { unsubscribe: () => observer.destroy() };
}

describe('invalidation-dispatcher — key mapping', () => {
  let invalidateQueries: ReturnType<typeof vi.fn>;
  let removeQueries: ReturnType<typeof vi.fn>;
  let queryClient: QueryClient;

  beforeEach(() => {
    invalidateQueries = vi.fn(async () => undefined);
    removeQueries = vi.fn();
    queryClient = { invalidateQueries, removeQueries } as unknown as QueryClient;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function calledQueryKeys(): QueryKey[] {
    return invalidateQueries.mock.calls.map((call) => call[0].queryKey as QueryKey);
  }

  it('notification event invalidates lists + unread', async () => {
    const dispatcher = createServerStateInvalidationDispatcher(queryClient);
    await dispatcher.invalidate({
      target: 'notification',
      identityScope: 'id-1',
      source: 'event-bus',
    });
    await flushTurn();

    const keys = calledQueryKeys();
    expect(keys).toContainEqual(notificationQueryKeys.lists('id-1'));
    expect(keys).toContainEqual(notificationQueryKeys.unread('id-1'));
    expect(keys).not.toContainEqual(notificationQueryKeys.details('id-1'));
  });

  it('notification event with entityId additionally invalidates detail(id)', async () => {
    const dispatcher = createServerStateInvalidationDispatcher(queryClient);
    await dispatcher.invalidate({
      target: 'notification',
      identityScope: 'id-1',
      source: 'sse',
      entityId: 'n-1',
    });
    await flushTurn();

    expect(calledQueryKeys()).toContainEqual(notificationQueryKeys.detail('id-1', 'n-1'));
  });

  it('notification mark-all / batch delete (mutation without entity) invalidates the identity root', async () => {
    const dispatcher = createServerStateInvalidationDispatcher(queryClient);
    await dispatcher.invalidate({
      target: 'notification',
      identityScope: 'id-1',
      source: 'mutation',
    });
    await flushTurn();

    expect(calledQueryKeys()).toContainEqual(notificationQueryKeys.identity('id-1'));
  });

  it('notification mark-read mutation invalidates lists + unread + detail(id)', async () => {
    const dispatcher = createServerStateInvalidationDispatcher(queryClient);
    await dispatcher.invalidate({
      target: 'notification',
      identityScope: 'id-1',
      source: 'mutation',
      entityId: 'n-1',
    });
    await flushTurn();

    const keys = calledQueryKeys();
    expect(keys).toContainEqual(notificationQueryKeys.lists('id-1'));
    expect(keys).toContainEqual(notificationQueryKeys.unread('id-1'));
    expect(keys).toContainEqual(notificationQueryKeys.detail('id-1', 'n-1'));
  });

  it('task-template mutation invalidates lists + detail(id) without details prefix', async () => {
    const dispatcher = createServerStateInvalidationDispatcher(queryClient);
    await dispatcher.invalidate({
      target: 'task-template',
      identityScope: 'id-1',
      source: 'mutation',
      entityId: 't-1',
    });
    await flushTurn();

    const keys = calledQueryKeys();
    expect(keys).toContainEqual(taskTemplateQueryKeys.lists('id-1'));
    expect(keys).toContainEqual(taskTemplateQueryKeys.detail('id-1', 't-1'));
    expect(keys).not.toContainEqual(taskTemplateQueryKeys.details('id-1'));
  });

  it('task_templates table change (projection all) invalidates lists + details prefix', async () => {
    const dispatcher = createServerStateInvalidationDispatcher(queryClient);
    await dispatcher.invalidate({
      target: 'task-template',
      identityScope: 'id-1',
      source: 'powersync',
      projection: 'all',
    });
    await flushTurn();

    const keys = calledQueryKeys();
    expect(keys).toContainEqual(taskTemplateQueryKeys.lists('id-1'));
    expect(keys).toContainEqual(taskTemplateQueryKeys.details('id-1'));
  });

  it('task-template mutation with projection lists invalidates lists only', async () => {
    const dispatcher = createServerStateInvalidationDispatcher(queryClient);
    await dispatcher.invalidate({
      target: 'task-template',
      identityScope: 'id-1',
      source: 'mutation',
      projection: 'lists',
    });
    await flushTurn();

    const keys = calledQueryKeys();
    expect(keys).toContainEqual(taskTemplateQueryKeys.lists('id-1'));
    expect(keys).not.toContainEqual(taskTemplateQueryKeys.details('id-1'));
  });

  it('governance mutation invalidates lists + details + revision prefix (+ detail(id))', async () => {
    const dispatcher = createServerStateInvalidationDispatcher(queryClient);
    await dispatcher.invalidate({
      target: 'governance',
      identityScope: 'id-1',
      source: 'mutation',
      entityId: 'RuleId_x',
    });
    await flushTurn();

    const keys = calledQueryKeys();
    expect(keys).toContainEqual(governanceQueryKeys.lists('id-1'));
    expect(keys).toContainEqual(governanceQueryKeys.details('id-1'));
    expect(keys).toContainEqual(governanceQueryKeys.detail('id-1', 'RuleId_x'));
    expect(
      keys.some((k) => k[0] === 'server-state' && k[1] === 'governance' && k[3] === 'revision'),
    ).toBe(true);
  });

  it('governance mutation projection revisions invalidates revisions only', async () => {
    const dispatcher = createServerStateInvalidationDispatcher(queryClient);
    await dispatcher.invalidate({
      target: 'governance',
      identityScope: 'id-1',
      source: 'mutation',
      projection: 'revisions',
    });
    await flushTurn();

    const keys = calledQueryKeys();
    expect(keys).toContainEqual([...governanceQueryKeys.identity('id-1'), 'revision'] as QueryKey);
    expect(keys).not.toContainEqual(governanceQueryKeys.lists('id-1'));
    expect(keys).not.toContainEqual(governanceQueryKeys.details('id-1'));
  });
});

describe('invalidation-dispatcher — turn batching & dedupe', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createTestServerQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
    vi.restoreAllMocks();
  });

  it('batches same-turn intents by target+identity+projection into one refetch', async () => {
    let calls = 0;
    const key = notificationQueryKeys.unread('id-1');
    const { unsubscribe } = observeActive(queryClient, key, async () => {
      calls++;
      return { count: calls };
    });
    await flushTurn();
    expect(calls).toBe(1); // initial fetch

    const dispatcher = createServerStateInvalidationDispatcher(queryClient);
    const p1 = dispatcher.invalidate({
      target: 'notification',
      identityScope: 'id-1',
      source: 'event-bus',
      dedupeKey: 'op-1',
    });
    const p2 = dispatcher.invalidate({
      target: 'notification',
      identityScope: 'id-1',
      source: 'sse',
      dedupeKey: 'op-2',
    });
    await Promise.all([p1, p2]);
    await flushTurn();

    expect(calls).toBe(2); // exactly one refetch for the merged batch
    unsubscribe();
  });

  it('suppresses repeated events carrying the same dedupeKey', async () => {
    const dispatcher = createServerStateInvalidationDispatcher(queryClient);
    const intent: ServerStateInvalidation = {
      target: 'notification',
      identityScope: 'id-1',
      source: 'event-bus',
      dedupeKey: 'dupe-1',
    };

    await dispatcher.invalidate(intent);
    await dispatcher.invalidate(intent);
    await flushTurn();

    expect(queryClient.getQueryState(notificationQueryKeys.unread('id-1'))).toBeUndefined();
  });

  it('dedupe LRU is bounded and evicts the oldest key (pilot: 256)', async () => {
    const dispatcher = createServerStateInvalidationDispatcher(queryClient, { dedupeLimit: 2 });
    const key = notificationQueryKeys.unread('id-1');
    let calls = 0;
    const { unsubscribe } = observeActive(queryClient, key, async () => {
      calls++;
      return { count: calls };
    });
    await flushTurn();
    const initial = calls;

    for (let i = 1; i <= 3; i++) {
      await dispatcher.invalidate({
        target: 'notification',
        identityScope: 'id-1',
        source: 'event-bus',
        dedupeKey: `unique-${i}`,
      });
    }
    await flushTurn();
    expect(calls).toBe(initial + 3);

    // unique-1 was evicted (LRU size 2) → processed again.
    await dispatcher.invalidate({
      target: 'notification',
      identityScope: 'id-1',
      source: 'event-bus',
      dedupeKey: 'unique-1',
    });
    await flushTurn();
    expect(calls).toBe(initial + 4);

    // But a fresh duplicate within the window is suppressed.
    await dispatcher.invalidate({
      target: 'notification',
      identityScope: 'id-1',
      source: 'event-bus',
      dedupeKey: 'unique-1',
    });
    await flushTurn();
    expect(calls).toBe(initial + 4);
    unsubscribe();
  });

  it('fails closed on empty identity — no invalidation and no global key fallback', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let calls = 0;
    const key = notificationQueryKeys.unread('id-1');
    const { unsubscribe } = observeActive(queryClient, key, async () => {
      calls++;
      return { count: calls };
    });
    await flushTurn();
    const initial = calls;

    const dispatcher = createServerStateInvalidationDispatcher(queryClient);
    await dispatcher.invalidate({
      target: 'notification',
      identityScope: '',
      source: 'event-bus',
    });
    await flushTurn();

    expect(calls).toBe(initial);
    expect(warn).toHaveBeenCalled();
    unsubscribe();
    warn.mockRestore();
  });
});

describe('invalidation-dispatcher — active/inactive refetch & identity clearing', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createTestServerQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
    vi.restoreAllMocks();
  });

  it('refetches active queries once and only marks inactive queries stale', async () => {
    const activeKey = notificationQueryKeys.list('id-1', { page: 1, limit: 20 });
    const inactiveKey = notificationQueryKeys.list('id-1', { page: 2, limit: 20 });
    let activeCalls = 0;
    let inactiveCalls = 0;

    const { unsubscribe } = observeActive(queryClient, activeKey, async () => {
      activeCalls++;
      return { items: [], total: 0 };
    });
    await queryClient.fetchQuery({
      queryKey: inactiveKey,
      queryFn: async () => {
        inactiveCalls++;
        return { items: [], total: 0 };
      },
    });
    await flushTurn();
    expect(activeCalls).toBe(1);
    expect(inactiveCalls).toBe(1);

    const dispatcher = createServerStateInvalidationDispatcher(queryClient);
    await dispatcher.invalidate({
      target: 'notification',
      identityScope: 'id-1',
      source: 'event-bus',
    });
    await flushTurn();

    // Active refetched; inactive untouched but marked invalidated/stale.
    expect(activeCalls).toBe(2);
    expect(inactiveCalls).toBe(1);
    expect(queryClient.getQueryState(inactiveKey)?.isInvalidated).toBe(true);
    unsubscribe();
  });

  it('clearIdentity removes pilot keys for that identity only', async () => {
    const dispatcher = createServerStateInvalidationDispatcher(queryClient);
    const keyA = notificationQueryKeys.unread('id-a');
    const keyB = notificationQueryKeys.unread('id-b');
    await queryClient.fetchQuery({ queryKey: keyA, queryFn: async () => 1 });
    await queryClient.fetchQuery({ queryKey: keyB, queryFn: async () => 2 });

    dispatcher.clearIdentity('id-a');

    expect(queryClient.getQueryState(keyA)).toBeUndefined();
    expect(queryClient.getQueryState(keyB)).not.toBeUndefined();
  });

  it('re-sends events after clearIdentity (dedupe records are dropped)', async () => {
    const dispatcher = createServerStateInvalidationDispatcher(queryClient);
    const intent: ServerStateInvalidation = {
      target: 'notification',
      identityScope: 'id-1',
      source: 'event-bus',
      dedupeKey: 'same-op',
    };

    await dispatcher.invalidate(intent);
    dispatcher.clearIdentity('id-1');
    await dispatcher.invalidate(intent);

    expect(queryClient.getQueryState(notificationQueryKeys.unread('id-1'))).toBeUndefined();
  });
});
