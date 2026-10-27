import {
  AIWorkflowCancelClientRequestSchema,
  AIGoalSurfaceLeaseRequestSchema,
  AIGoalSurfaceLeaseResponseSchema,
  type AIGoalSurfaceLeaseRequest,
  type AIGoalSurfaceLeaseResponse,
  AIWorkflowGetClientRequestSchema,
  AIWorkflowListClientRequestSchema,
  AIWorkflowResumeClientRequestSchema,
  AIWorkflowRunViewSchema,
  AIWorkflowStartClientRequestSchema,
  type AIWorkflowCancelClientRequest,
  type AIWorkflowGetClientRequest,
  type AIWorkflowListClientRequest,
  type AIWorkflowResumeClientRequest,
  type AIWorkflowRunView,
  type AIWorkflowStartClientRequest,
  WorkspaceEventSchema,
  type WorkspaceEvent,
} from '@memoflow/ai-contracts';
import { AIChannels, AIStreamChannels } from '@memoflow/contracts/electron';
import { unwrapOrThrowError } from '@memoflow/transport-contracts/result';
import type { IResultHttpClient } from '@memoflow/http-client';
import type { IResultIpcClient } from '@memoflow/ipc-client';
import { createResultClientError } from '../infrastructure-client/adapters/result-client-error';
import { createResultClientErrorFromResponse } from '../infrastructure-client/adapters/result-client-error';
import { parseSSE } from '../shared/parse-sse';
import { createStreamId } from '../shared/create-stream-id';
import { lastArg } from '../shared/last-arg';

export type WorkspaceEventStreamOptions = {
  cursor?: string;
  signal: AbortSignal;
  onEvent: (event: WorkspaceEvent) => void | Promise<void>;
};

const DEFAULT_WORKFLOW_POLL_INTERVAL_MS = 500;
const DEFAULT_WORKFLOW_POLL_TIMEOUT_MS = 180_000;

type WorkflowRuntimePollingOptions = {
  readonly intervalMs?: number;
  readonly timeoutMs?: number;
};

function delay(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

function isTransientPollingFailure(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  return code === 'NETWORK_ERROR' || code === 'TIMEOUT' || code === 'SERVICE_UNAVAILABLE';
}

async function awaitStableWorkflowRun(
  initial: AIWorkflowRunView,
  load: (runId: string) => Promise<AIWorkflowRunView | null>,
  options: WorkflowRuntimePollingOptions,
): Promise<AIWorkflowRunView> {
  if (initial.status !== 'running') return initial;
  const intervalMs = options.intervalMs ?? DEFAULT_WORKFLOW_POLL_INTERVAL_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_WORKFLOW_POLL_TIMEOUT_MS;
  const deadline = Date.now() + Math.max(0, timeoutMs);
  let current = initial;

  while (current.status === 'running' && Date.now() < deadline) {
    await delay(intervalMs);
    try {
      const next = await load(current.runId);
      if (next) current = next;
    } catch (error) {
      if (!isTransientPollingFailure(error)) throw error;
    }
  }

  // The durable run remains authoritative even when the client-side wait budget
  // expires. Returning the running pointer lets UI persistence restore it later.
  return current;
}

/** Canonical cross-host Workflow client. No Mastra private type crosses this seam. */
export interface WorkflowRuntimeClient {
  streamWorkspaceEvents?(options: WorkspaceEventStreamOptions): Promise<void>;
  start(request: AIWorkflowStartClientRequest): Promise<AIWorkflowRunView>;
  resume(request: AIWorkflowResumeClientRequest): Promise<AIWorkflowRunView>;
  get(request: AIWorkflowGetClientRequest): Promise<AIWorkflowRunView | null>;
  list(request?: AIWorkflowListClientRequest): Promise<readonly AIWorkflowRunView[]>;
  cancel(request: AIWorkflowCancelClientRequest): Promise<AIWorkflowRunView | null>;
  goalSurfaceLease(request: AIGoalSurfaceLeaseRequest): Promise<AIGoalSurfaceLeaseResponse>;
}

function invalidRequest(kind: string): never {
  throw createResultClientError(`Invalid AI workflow ${kind} request`, 'VALIDATION_ERROR');
}

function parseRun(value: unknown): AIWorkflowRunView {
  const parsed = AIWorkflowRunViewSchema.safeParse(value);
  if (!parsed.success) {
    throw createResultClientError('Invalid AI workflow run response', 'AI_RUNTIME_PROTOCOL_ERROR');
  }
  return parsed.data;
}

function parseOptionalRun(value: unknown): AIWorkflowRunView | null {
  if (value === null) return null;
  return parseRun(value);
}

function parseRuns(value: unknown): readonly AIWorkflowRunView[] {
  if (!Array.isArray(value)) {
    throw createResultClientError('Invalid AI workflow list response', 'AI_RUNTIME_PROTOCOL_ERROR');
  }
  return value.map(parseRun);
}

export class WorkflowRuntimeHttpClient implements WorkflowRuntimeClient {
  constructor(
    private readonly httpClient: IResultHttpClient,
    private readonly polling: WorkflowRuntimePollingOptions = {},
  ) {}

  async streamWorkspaceEvents(options: WorkspaceEventStreamOptions): Promise<void> {
    const response = await this.httpClient.stream('/ai/runtime/workspace/sse', {
      method: 'GET',
      signal: options.signal,
      ...(options.cursor ? { headers: { 'Last-Event-ID': options.cursor } } : {}),
    });
    if (!response.ok)
      throw await createResultClientErrorFromResponse(response, 'Workspace events unavailable');
    for await (const frame of parseSSE(response)) {
      if (options.signal.aborted) return;
      if (frame.event !== 'workspace') continue;
      let value: unknown;
      try {
        value = JSON.parse(frame.data);
      } catch {
        throw createResultClientError('Invalid Workspace event JSON', 'AI_RUNTIME_PROTOCOL_ERROR');
      }
      const parsed = WorkspaceEventSchema.safeParse(value);
      if (!parsed.success)
        throw createResultClientError(
          'Invalid Workspace event contract',
          'AI_RUNTIME_PROTOCOL_ERROR',
        );
      await options.onEvent(parsed.data);
    }
  }

  async start(request: AIWorkflowStartClientRequest): Promise<AIWorkflowRunView> {
    const parsed = AIWorkflowStartClientRequestSchema.safeParse(request);
    if (!parsed.success) invalidRequest('start');
    const result = await this.httpClient.post<unknown>('/ai/runtime/workflow/start', parsed.data);
    return parseRun(unwrapOrThrowError(result));
  }

  async resume(request: AIWorkflowResumeClientRequest): Promise<AIWorkflowRunView> {
    const parsed = AIWorkflowResumeClientRequestSchema.safeParse(request);
    if (!parsed.success) invalidRequest('resume');
    const result = await this.httpClient.post<unknown>('/ai/runtime/workflow/resume', parsed.data);
    const run = parseRun(unwrapOrThrowError(result));
    if (run.kind === 'goal.create') return run;
    return awaitStableWorkflowRun(run, (runId) => this.get({ runId }), this.polling);
  }

  async get(request: AIWorkflowGetClientRequest): Promise<AIWorkflowRunView | null> {
    const parsed = AIWorkflowGetClientRequestSchema.safeParse(request);
    if (!parsed.success) invalidRequest('get');
    const result = await this.httpClient.post<unknown>('/ai/runtime/workflow/get', parsed.data);
    return parseOptionalRun(unwrapOrThrowError(result));
  }

  async list(request: AIWorkflowListClientRequest = {}): Promise<readonly AIWorkflowRunView[]> {
    const parsed = AIWorkflowListClientRequestSchema.safeParse(request);
    if (!parsed.success) invalidRequest('list');
    const result = await this.httpClient.post<unknown>('/ai/runtime/workflow/list', parsed.data);
    return parseRuns(unwrapOrThrowError(result));
  }

  async goalSurfaceLease(request: AIGoalSurfaceLeaseRequest): Promise<AIGoalSurfaceLeaseResponse> {
    const parsed = AIGoalSurfaceLeaseRequestSchema.safeParse(request);
    if (!parsed.success) invalidRequest('Goal surface lease');
    const result = await this.httpClient.post<unknown>(
      '/ai/runtime/workflow/goal-surface-lease',
      parsed.data,
    );
    return AIGoalSurfaceLeaseResponseSchema.parse(unwrapOrThrowError(result));
  }

  async cancel(request: AIWorkflowCancelClientRequest): Promise<AIWorkflowRunView | null> {
    const parsed = AIWorkflowCancelClientRequestSchema.safeParse(request);
    if (!parsed.success) invalidRequest('cancel');
    const result = await this.httpClient.post<unknown>('/ai/runtime/workflow/cancel', parsed.data);
    return parseOptionalRun(unwrapOrThrowError(result));
  }
}

export class WorkflowRuntimeIpcClient implements WorkflowRuntimeClient {
  constructor(
    private readonly ipcClient: IResultIpcClient,
    private readonly polling: WorkflowRuntimePollingOptions = {},
  ) {}

  async streamWorkspaceEvents(options: WorkspaceEventStreamOptions): Promise<void> {
    const bridge = this.ipcClient.getBridge?.();
    if (!bridge)
      throw createResultClientError('Workspace events require Desktop IPC', 'NOT_SUPPORTED');
    if (options.signal.aborted) return;
    const streamId = createStreamId();
    let finish!: () => void;
    let reject!: (error: unknown) => void;
    let ended = false;
    const completion = new Promise<void>((resolve, fail) => {
      finish = resolve;
      reject = fail;
    });
    const stop = () => {
      if (ended) return;
      ended = true;
      finish();
    };
    const onEnd = (...args: unknown[]) => {
      const value = lastArg<{ streamId?: unknown }>(args);
      if (value?.streamId === streamId) stop();
    };
    const onEvent = (...args: unknown[]) => {
      const value = lastArg<{ streamId?: unknown; event?: unknown }>(args);
      if (ended || value?.streamId !== streamId) return;
      void (async () => {
        try {
          const event = WorkspaceEventSchema.parse(value.event);
          await options.onEvent(event);
          if (!ended)
            unwrapOrThrowError(
              await this.ipcClient.invoke(AIChannels.RUNTIME_WORKSPACE_ACK, {
                streamId,
                cursor: event.cursor,
              }),
            );
        } catch {
          ended = true;
          reject(
            createResultClientError('Workspace event delivery failed', 'AI_RUNTIME_PROTOCOL_ERROR'),
          );
        }
      })();
    };
    bridge.on(AIStreamChannels.RUNTIME_WORKSPACE_EVENT, onEvent);
    bridge.on(AIStreamChannels.RUNTIME_WORKSPACE_END, onEnd);
    options.signal.addEventListener('abort', stop, { once: true });
    try {
      // Start can fail before completion is awaited; attach a handler immediately.
      void completion.catch(() => undefined);
      unwrapOrThrowError(
        await this.ipcClient.invoke(AIChannels.RUNTIME_WORKSPACE_START, {
          streamId,
          ...(options.cursor ? { cursor: options.cursor } : {}),
        }),
      );
      if (options.signal.aborted) stop();
      await completion;
    } finally {
      ended = true;
      bridge.off(AIStreamChannels.RUNTIME_WORKSPACE_EVENT, onEvent);
      bridge.off(AIStreamChannels.RUNTIME_WORKSPACE_END, onEnd);
      options.signal.removeEventListener('abort', stop);
      await this.ipcClient
        .invoke(AIChannels.RUNTIME_WORKSPACE_STOP, { streamId })
        .catch(() => undefined);
    }
  }

  async start(request: AIWorkflowStartClientRequest): Promise<AIWorkflowRunView> {
    const parsed = AIWorkflowStartClientRequestSchema.safeParse(request);
    if (!parsed.success) invalidRequest('start');
    const result = await this.ipcClient.invoke<unknown>(
      AIChannels.RUNTIME_WORKFLOW_START,
      parsed.data,
    );
    return parseRun(unwrapOrThrowError(result));
  }

  async resume(request: AIWorkflowResumeClientRequest): Promise<AIWorkflowRunView> {
    const parsed = AIWorkflowResumeClientRequestSchema.safeParse(request);
    if (!parsed.success) invalidRequest('resume');
    const result = await this.ipcClient.invoke<unknown>(
      AIChannels.RUNTIME_WORKFLOW_RESUME,
      parsed.data,
    );
    const run = parseRun(unwrapOrThrowError(result));
    if (run.kind === 'goal.create') return run;
    return awaitStableWorkflowRun(run, (runId) => this.get({ runId }), this.polling);
  }

  async get(request: AIWorkflowGetClientRequest): Promise<AIWorkflowRunView | null> {
    const parsed = AIWorkflowGetClientRequestSchema.safeParse(request);
    if (!parsed.success) invalidRequest('get');
    const result = await this.ipcClient.invoke<unknown>(
      AIChannels.RUNTIME_WORKFLOW_GET,
      parsed.data,
    );
    return parseOptionalRun(unwrapOrThrowError(result));
  }

  async list(request: AIWorkflowListClientRequest = {}): Promise<readonly AIWorkflowRunView[]> {
    const parsed = AIWorkflowListClientRequestSchema.safeParse(request);
    if (!parsed.success) invalidRequest('list');
    const result = await this.ipcClient.invoke<unknown>(
      AIChannels.RUNTIME_WORKFLOW_LIST,
      parsed.data,
    );
    return parseRuns(unwrapOrThrowError(result));
  }

  async goalSurfaceLease(request: AIGoalSurfaceLeaseRequest): Promise<AIGoalSurfaceLeaseResponse> {
    const parsed = AIGoalSurfaceLeaseRequestSchema.safeParse(request);
    if (!parsed.success) invalidRequest('Goal surface lease');
    const result = await this.ipcClient.invoke<unknown>(
      AIChannels.RUNTIME_WORKFLOW_GOAL_SURFACE_LEASE,
      parsed.data,
    );
    return AIGoalSurfaceLeaseResponseSchema.parse(unwrapOrThrowError(result));
  }

  async cancel(request: AIWorkflowCancelClientRequest): Promise<AIWorkflowRunView | null> {
    const parsed = AIWorkflowCancelClientRequestSchema.safeParse(request);
    if (!parsed.success) invalidRequest('cancel');
    const result = await this.ipcClient.invoke<unknown>(
      AIChannels.RUNTIME_WORKFLOW_CANCEL,
      parsed.data,
    );
    return parseOptionalRun(unwrapOrThrowError(result));
  }
}

export function createWorkflowRuntimeHttpClient(
  httpClient: IResultHttpClient,
): WorkflowRuntimeClient {
  return new WorkflowRuntimeHttpClient(httpClient);
}

export function createWorkflowRuntimeIpcClient(ipcClient: IResultIpcClient): WorkflowRuntimeClient {
  return new WorkflowRuntimeIpcClient(ipcClient);
}
