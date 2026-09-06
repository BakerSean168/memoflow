import { describe, expect, it } from 'vitest';
import { createServerStateRuntime, createTestServerStateRuntime } from './runtime';
import { notificationQueryKeys, taskTemplateQueryKeys } from './query-keys';

describe('createServerStateRuntime (plan §3.1)', () => {
  it('creates one QueryClient + dispatcher per runtime (never shared across renderers)', () => {
    const web = createServerStateRuntime('web');
    const desktop = createServerStateRuntime('desktop');

    expect(web.queryClient).not.toBe(desktop.queryClient);
    expect(web.dispatcher).not.toBe(desktop.dispatcher);
  });

  it('applies the lane networkMode policy (web online, desktop always)', async () => {
    const web = createServerStateRuntime('web');
    const desktop = createServerStateRuntime('desktop');

    const key = notificationQueryKeys.unread('id-1');
    await web.queryClient.fetchQuery({ queryKey: key, queryFn: async () => 1 });
    await desktop.queryClient.fetchQuery({ queryKey: key, queryFn: async () => 1 });

    const webQuery = web.queryClient.getQueryCache().find({ queryKey: key });
    const desktopQuery = desktop.queryClient.getQueryCache().find({ queryKey: key });
    expect(webQuery?.options.networkMode).toBe('online');
    expect(desktopQuery?.options.networkMode).toBe('always');
  });

  it('clearIdentity removes pilot keys for the identity through the dispatcher', async () => {
    const runtime = createTestServerStateRuntime();
    const notifKey = notificationQueryKeys.unread('id-a');
    const taskKey = taskTemplateQueryKeys.list('id-a', { page: 1, limit: 20 });
    await runtime.queryClient.fetchQuery({ queryKey: notifKey, queryFn: async () => 1 });
    await runtime.queryClient.fetchQuery({ queryKey: taskKey, queryFn: async () => 1 });

    runtime.clearIdentity('id-a');

    expect(runtime.queryClient.getQueryState(notifKey)).toBeUndefined();
    expect(runtime.queryClient.getQueryState(taskKey)).toBeUndefined();
  });

  it('dispose clears the whole pilot cache', async () => {
    const runtime = createTestServerStateRuntime();
    const key = notificationQueryKeys.unread('id-1');
    await runtime.queryClient.fetchQuery({ queryKey: key, queryFn: async () => 1 });

    runtime.dispose();

    expect(runtime.queryClient.getQueryState(key)).toBeUndefined();
  });
});

describe('createTestServerStateRuntime', () => {
  it('pins retry off and short gc for deterministic tests', () => {
    const runtime = createTestServerStateRuntime();
    expect(runtime.queryClient.getDefaultOptions().queries?.retry).toBe(false);
    expect(runtime.queryClient.getDefaultOptions().queries?.gcTime).toBe(1_000);
    expect(runtime.queryClient.getDefaultOptions().mutations?.retry).toBe(0);
  });
});
