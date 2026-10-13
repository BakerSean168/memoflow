import { expect, it, vi } from 'vitest';
import type { WorkflowRuntimeClient, WorkspaceEventStreamOptions } from '@memoflow/ai/client';
import { subscribeWorkspaceEvents } from '../../../shared/services/workspace-event-subscription';

it('shares one transport, calibrates late subscribers, and closes only after the last consumer leaves', async () => {
  let options!: WorkspaceEventStreamOptions;
  const stream = vi.fn((input: WorkspaceEventStreamOptions) => {
    options = input;
    return new Promise<void>((resolve) =>
      input.signal.addEventListener('abort', () => resolve(), { once: true }),
    );
  });
  const runtime: WorkflowRuntimeClient = {
    streamWorkspaceEvents: stream,
    start: vi.fn(),
    resume: vi.fn(),
    get: vi.fn(),
    list: vi.fn(),
    cancel: vi.fn(),
    goalSurfaceLease: vi.fn(),
  };
  const first = new AbortController();
  const second = new AbortController();
  const receiveFirst = vi.fn(async () => {});
  const receiveSecond = vi.fn(async () => {});
  const firstSubscription = subscribeWorkspaceEvents(runtime, {
    signal: first.signal,
    onEvent: receiveFirst,
  });
  await options.onEvent({ type: 'stream.ready', cursor: 'ready' });
  const secondSubscription = subscribeWorkspaceEvents(runtime, {
    signal: second.signal,
    onEvent: receiveSecond,
  });
  await vi.waitFor(() =>
    expect(receiveSecond).toHaveBeenCalledWith({ type: 'stream.ready', cursor: 'ready' }),
  );
  expect(stream).toHaveBeenCalledOnce();
  first.abort();
  await firstSubscription;
  expect(options.signal.aborted).toBe(false);
  await options.onEvent({
    type: 'attention.changed',
    cursor: 'next',
    eventId: 'event',
    resourceVersion: 1,
    data: { conversationId: 'conversation', runtimeKind: 'builtin', attention: null },
  });
  expect(receiveFirst).toHaveBeenCalledOnce();
  expect(receiveSecond).toHaveBeenCalledTimes(2);
  second.abort();
  await secondSubscription;
  expect(options.signal.aborted).toBe(true);
});

it('awaits all active projections before committing the reconnect cursor', async () => {
  vi.useFakeTimers();
  try {
    const starts: WorkspaceEventStreamOptions[] = [];
    let end!: () => void;
    const runtime: WorkflowRuntimeClient = {
      streamWorkspaceEvents: vi.fn((input) => {
        starts.push(input);
        return new Promise<void>((resolve) => {
          end = resolve;
        });
      }),
      start: vi.fn(),
      resume: vi.fn(),
      get: vi.fn(),
      list: vi.fn(),
      cancel: vi.fn(),
      goalSurfaceLease: vi.fn(),
    };
    const controller = new AbortController();
    let complete!: () => void;
    const subscription = subscribeWorkspaceEvents(runtime, {
      signal: controller.signal,
      onEvent: () =>
        new Promise<void>((resolve) => {
          complete = resolve;
        }),
    });
    const delivery = starts[0]!.onEvent({ type: 'stream.ready', cursor: 'committed' });
    await Promise.resolve();
    expect(complete).toBeDefined();
    complete();
    await delivery;
    end();
    await vi.advanceTimersByTimeAsync(1000);
    expect(starts).toHaveLength(2);
    expect(starts[1]!.cursor).toBe('committed');
    controller.abort();
    end();
    await subscription;
  } finally {
    vi.useRealTimers();
  }
});

it('does not advance a shared cursor when one active projection rejects an event', async () => {
  vi.useFakeTimers();
  try {
    const starts: WorkspaceEventStreamOptions[] = [];
    const finish: Array<() => void> = [];
    const runtime: WorkflowRuntimeClient = {
      streamWorkspaceEvents: vi.fn((input) => {
        starts.push(input);
        return new Promise<void>((resolve) => {
          finish.push(resolve);
        });
      }),
      start: vi.fn(),
      resume: vi.fn(),
      get: vi.fn(),
      list: vi.fn(),
      cancel: vi.fn(),
      goalSurfaceLease: vi.fn(),
    };
    const failedController = new AbortController();
    const survivingController = new AbortController();
    const failedProjection = vi.fn(async (event: { type: string }) => {
      if (event.type === 'attention.changed') throw new Error('projection refused');
    });
    const survivingProjection = vi.fn(async () => {});
    const failedSubscription = subscribeWorkspaceEvents(runtime, {
      signal: failedController.signal,
      onEvent: failedProjection,
    });
    const survivingSubscription = subscribeWorkspaceEvents(runtime, {
      signal: survivingController.signal,
      onEvent: survivingProjection,
    });
    await starts[0]!.onEvent({ type: 'stream.ready', cursor: 'previous' });
    const event = {
      type: 'attention.changed',
      cursor: 'uncommitted',
      eventId: 'event',
      resourceVersion: 1,
      data: { conversationId: 'conversation', runtimeKind: 'builtin', attention: null },
    } as const;
    const subscriptionFailure = failedSubscription.catch((error: unknown) => error);
    await expect(starts[0]!.onEvent(event)).rejects.toThrow('projection refused');
    expect(await subscriptionFailure).toMatchObject({ message: 'projection refused' });
    expect(survivingProjection).toHaveBeenCalledWith(event);
    finish[0]!();
    await vi.advanceTimersByTimeAsync(1000);
    expect(starts).toHaveLength(2);
    expect(starts[1]!.cursor).toBe('previous');
    survivingController.abort();
    finish[1]!();
    await survivingSubscription;
  } finally {
    vi.useRealTimers();
  }
});
