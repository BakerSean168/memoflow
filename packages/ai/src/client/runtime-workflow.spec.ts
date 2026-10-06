import { describe, expect, it, vi } from 'vitest';
import { AIChannels } from '@memoflow/contracts/electron';
import { ok } from '@memoflow/contracts/result';
import type { IResultHttpClient } from '@memoflow/http-client';
import { WorkflowRuntimeHttpClient, WorkflowRuntimeIpcClient } from './runtime-workflow';

function httpStub(overrides: Partial<IResultHttpClient> = {}): IResultHttpClient {
  return {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    stream: vi.fn(),
    ...overrides,
  };
}

const run = {
  runId: 'workflow-1',
  kind: 'goal.create' as const,
  conversationId: 'conversation-1',
  status: 'suspended' as const,
  suspension: {
    type: 'clarification_required' as const,
    questions: ['What is the target date?'],
  },
  createdAt: 1,
  updatedAt: 2,
};

const startRequest = {
  kind: 'goal.create' as const,
  conversationId: 'conversation-1',
  input: { idea: 'Run a 5K' },
};

const resumeRequest = {
  runId: 'workflow-1',
  command: { type: 'answer' as const, answers: ['In 8 weeks'] },
};

describe('WorkflowRuntimeHttpClient', () => {
  it('uses the canonical workflow request paths and validates returned run views', async () => {
    const post = vi.fn(async (url: string) => {
      if (url.endsWith('/list')) return ok([run]);
      if (url.endsWith('/get') || url.endsWith('/cancel')) return ok(run);
      return ok(run);
    });
    const client = new WorkflowRuntimeHttpClient(httpStub({ post }));

    await expect(client.start(startRequest)).resolves.toEqual(run);
    await expect(client.resume(resumeRequest)).resolves.toEqual(run);
    await expect(client.get({ runId: 'workflow-1' })).resolves.toEqual(run);
    await expect(client.list({ conversationId: 'conversation-1' })).resolves.toEqual([run]);
    await expect(client.cancel({ runId: 'workflow-1' })).resolves.toEqual(run);

    expect(post.mock.calls.map(([url]) => url)).toEqual([
      '/ai/runtime/workflow/start',
      '/ai/runtime/workflow/resume',
      '/ai/runtime/workflow/get',
      '/ai/runtime/workflow/list',
      '/ai/runtime/workflow/cancel',
    ]);
    expect(JSON.stringify(post.mock.calls)).not.toContain('identityId');
  });

  it('returns a detached HTTP start pointer immediately without hidden polling', async () => {
    const running = { ...run, status: 'running' as const, suspension: undefined };
    const post = vi.fn().mockResolvedValue(ok(running));
    const client = new WorkflowRuntimeHttpClient(httpStub({ post }), {
      intervalMs: 0,
      timeoutMs: 1_000,
    });

    await expect(client.start(startRequest)).resolves.toEqual(running);
    expect(post.mock.calls.map(([url]) => url)).toEqual(['/ai/runtime/workflow/start']);
  });

  it('polls a detached HTTP resume until the durable run reaches a stable state', async () => {
    const running = { ...run, status: 'running' as const, suspension: undefined };
    const post = vi
      .fn()
      .mockResolvedValueOnce(ok(running))
      .mockResolvedValueOnce(ok(running))
      .mockResolvedValueOnce(ok(run));
    const client = new WorkflowRuntimeHttpClient(httpStub({ post }), {
      intervalMs: 0,
      timeoutMs: 1_000,
    });

    await expect(client.resume(resumeRequest)).resolves.toEqual(run);
    expect(post.mock.calls.map(([url]) => url)).toEqual([
      '/ai/runtime/workflow/resume',
      '/ai/runtime/workflow/get',
      '/ai/runtime/workflow/get',
    ]);
  });

  it('rejects identity injection and malformed runtime projections', async () => {
    const client = new WorkflowRuntimeHttpClient(httpStub());
    await expect(
      client.start({ ...startRequest, identityId: 'attacker-controlled' } as never),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    const malformed = new WorkflowRuntimeHttpClient(
      httpStub({ post: vi.fn().mockResolvedValue(ok({ runId: 'private-mastra-run' })) }),
    );
    await expect(malformed.start(startRequest)).rejects.toMatchObject({
      code: 'AI_RUNTIME_PROTOCOL_ERROR',
    });
  });
});

describe('WorkflowRuntimeIpcClient', () => {
  it('mirrors HTTP semantics over the canonical workflow IPC channels', async () => {
    const invoke = vi.fn(async (channel: string) => {
      if (channel === AIChannels.RUNTIME_WORKFLOW_LIST) return ok([run]);
      return ok(run);
    });
    const client = new WorkflowRuntimeIpcClient({ invoke } as never);

    await expect(client.start(startRequest)).resolves.toEqual(run);
    await expect(client.resume(resumeRequest)).resolves.toEqual(run);
    await expect(client.get({ runId: 'workflow-1' })).resolves.toEqual(run);
    await expect(client.list()).resolves.toEqual([run]);
    await expect(client.cancel({ runId: 'workflow-1' })).resolves.toEqual(run);

    expect(invoke.mock.calls.map(([channel]) => channel)).toEqual([
      AIChannels.RUNTIME_WORKFLOW_START,
      AIChannels.RUNTIME_WORKFLOW_RESUME,
      AIChannels.RUNTIME_WORKFLOW_GET,
      AIChannels.RUNTIME_WORKFLOW_LIST,
      AIChannels.RUNTIME_WORKFLOW_CANCEL,
    ]);
    expect(JSON.stringify(invoke.mock.calls)).not.toContain('identityId');
  });

  it('returns detached IPC start immediately and polls only resume through get', async () => {
    const running = { ...run, status: 'running' as const, suspension: undefined };
    const invoke = vi.fn(async (channel: string) => {
      if (channel === AIChannels.RUNTIME_WORKFLOW_START) return ok(running);
      if (channel === AIChannels.RUNTIME_WORKFLOW_RESUME) return ok(running);
      if (channel === AIChannels.RUNTIME_WORKFLOW_GET) return ok(run);
      return ok(run);
    });
    const client = new WorkflowRuntimeIpcClient({ invoke } as never, {
      intervalMs: 0,
      timeoutMs: 1_000,
    });

    await expect(client.start(startRequest)).resolves.toEqual(running);
    expect(invoke.mock.calls.map(([channel]) => channel)).toEqual([
      AIChannels.RUNTIME_WORKFLOW_START,
    ]);
    await expect(client.resume(resumeRequest)).resolves.toEqual(run);
    expect(invoke.mock.calls.map(([channel]) => channel)).toEqual([
      AIChannels.RUNTIME_WORKFLOW_START,
      AIChannels.RUNTIME_WORKFLOW_RESUME,
      AIChannels.RUNTIME_WORKFLOW_GET,
    ]);
  });
});
