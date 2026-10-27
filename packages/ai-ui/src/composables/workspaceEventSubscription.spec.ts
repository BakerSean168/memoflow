import { installAiUiHost } from '@ai-ui-test-host/di/ai-ui-host';
installAiUiHost();
import { expect, it, vi } from 'vitest';
import type { WorkflowRuntimeClient, WorkspaceEventStreamOptions } from '@memoflow/ai-client';
import { subscribeWorkspaceEvents } from '@ai-ui-test-host/shared/services/workspace-event-subscription';

it('reconnects when a late consumer rejects its synthetic ready snapshot', async () => {
  const starts: WorkspaceEventStreamOptions[] = [];
  const runtime: WorkflowRuntimeClient = {
    streamWorkspaceEvents: vi.fn((options) => {
      starts.push(options);
      return new Promise<void>((resolve) =>
        options.signal.addEventListener('abort', () => resolve(), {
          once: true,
        }),
      );
    }),
    start: vi.fn(),
    resume: vi.fn(),
    get: vi.fn(),
    list: vi.fn(),
    cancel: vi.fn(),
    goalSurfaceLease: vi.fn(),
  };
  const first = new AbortController();
  const second = new AbortController();
  const firstSubscription = subscribeWorkspaceEvents(runtime, {
    signal: first.signal,
    onEvent: async () => {},
  });
  await starts[0]!.onEvent({ type: 'stream.ready', cursor: 'before' });
  const projection = vi.fn(async () => {}).mockRejectedValueOnce(new Error('snapshot unavailable'));
  const secondSubscription = subscribeWorkspaceEvents(runtime, {
    signal: second.signal,
    onEvent: projection,
  });
  try {
    await vi.waitFor(() => expect(starts).toHaveLength(2));
    expect(starts[0]!.signal.aborted).toBe(true);
    expect(starts[1]!.cursor).toBeUndefined();
    await starts[1]!.onEvent({ type: 'stream.ready', cursor: 'recovered' });
    expect(projection).toHaveBeenLastCalledWith({
      type: 'stream.ready',
      cursor: 'recovered',
    });
    expect(projection).toHaveBeenCalledTimes(2);
  } finally {
    first.abort();
    second.abort();
    await Promise.all([firstSubscription, secondSubscription]);
  }
});

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
    expect(receiveSecond).toHaveBeenCalledWith({
      type: 'stream.ready',
      cursor: 'ready',
    }),
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
    data: {
      conversationId: 'conversation',
      runtimeKind: 'builtin',
      attention: null,
    },
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
    const delivery = starts[0]!.onEvent({
      type: 'stream.ready',
      cursor: 'committed',
    });
    await vi.waitFor(() => expect(complete).toBeDefined());
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
      data: {
        conversationId: 'conversation',
        runtimeKind: 'builtin',
        attention: null,
      },
    } as const;
    await expect(starts[0]!.onEvent(event)).rejects.toThrow('projection refused');
    expect(survivingProjection).toHaveBeenCalledWith(event);
    finish[0]!();
    await vi.advanceTimersByTimeAsync(1000);
    expect(starts).toHaveLength(2);
    expect(starts[1]!.cursor).toBe('previous');
    await starts[1]!.onEvent({ type: 'stream.ready', cursor: 'recovered' });
    expect(failedProjection).toHaveBeenLastCalledWith({
      type: 'stream.ready',
      cursor: 'recovered',
    });
    failedController.abort();
    survivingController.abort();
    finish[1]!();
    await Promise.all([failedSubscription, survivingSubscription]);
  } finally {
    vi.useRealTimers();
  }
});

it('resets the reconnect cursor and calibrates new listeners after a stream epoch reset', async () => {
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
    const first = new AbortController();
    const second = new AbortController();
    const receiveFirst = vi.fn(async () => {});
    const receiveSecond = vi.fn(async () => {});
    const firstSubscription = subscribeWorkspaceEvents(runtime, {
      signal: first.signal,
      onEvent: receiveFirst,
    });
    await starts[0]!.onEvent({ type: 'stream.ready', cursor: 'old-epoch' });
    await starts[0]!.onEvent({
      type: 'stream.reset_required',
      cursor: 'reset',
      reason: 'expired',
    });

    // The previous epoch cannot be handed to a newly mounted projection.
    const secondSubscription = subscribeWorkspaceEvents(runtime, {
      signal: second.signal,
      onEvent: receiveSecond,
    });
    expect(receiveSecond).not.toHaveBeenCalled();
    finish[0]!();
    await vi.advanceTimersByTimeAsync(1000);
    expect(starts).toHaveLength(2);
    expect(starts[1]!.cursor).toBeUndefined();

    await starts[1]!.onEvent({ type: 'stream.ready', cursor: 'new-epoch' });
    expect(receiveFirst).toHaveBeenLastCalledWith({
      type: 'stream.ready',
      cursor: 'new-epoch',
    });
    expect(receiveSecond).toHaveBeenCalledOnce();
    expect(receiveSecond).toHaveBeenCalledWith({
      type: 'stream.ready',
      cursor: 'new-epoch',
    });
    first.abort();
    second.abort();
    finish[1]!();
    await Promise.all([firstSubscription, secondSubscription]);
  } finally {
    vi.useRealTimers();
  }
});

it('calibrates a consumer joining while the initial stream.ready projection is still pending', async () => {
  let transport!: WorkspaceEventStreamOptions;
  const stream = vi.fn((options: WorkspaceEventStreamOptions) => {
    transport = options;
    return new Promise<void>((resolve) =>
      options.signal.addEventListener('abort', () => resolve(), { once: true }),
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
  let entered!: () => void;
  const initialProjectionEntered = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let complete!: () => void;
  const initialProjection = vi.fn(async (event: { type: string }) => {
    if (event.type === 'stream.ready') {
      entered();
      await new Promise<void>((resolve) => {
        complete = resolve;
      });
    }
  });
  const first = new AbortController();
  const second = new AbortController();
  const firstSubscription = subscribeWorkspaceEvents(runtime, {
    signal: first.signal,
    onEvent: initialProjection,
  });
  const readyDelivery = transport.onEvent({
    type: 'stream.ready',
    cursor: 'current',
  });
  await initialProjectionEntered;
  const secondProjection = vi.fn(async () => {});
  const secondSubscription = subscribeWorkspaceEvents(runtime, {
    signal: second.signal,
    onEvent: secondProjection,
  });
  expect(secondProjection).not.toHaveBeenCalled();
  complete();
  try {
    await readyDelivery;
    await vi.waitFor(() =>
      expect(secondProjection).toHaveBeenCalledWith({
        type: 'stream.ready',
        cursor: 'current',
      }),
    );
    expect(stream).toHaveBeenCalledOnce();
  } finally {
    first.abort();
    second.abort();
    await Promise.all([firstSubscription, secondSubscription]);
  }
});
