import {
  AIWorkflowCancelClientRequestSchema,
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
} from '@memoflow/contracts/ai';
import { AIChannels } from '@memoflow/contracts/electron';
import { unwrapOrThrowError } from '@memoflow/contracts/result';
import type { IResultHttpClient } from '@memoflow/http-client';
import type { IResultIpcClient } from '@memoflow/ipc-client';
import { createResultClientError } from '../infrastructure-client/adapters/result-client-error';

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
  start(request: AIWorkflowStartClientRequest): Promise<AIWorkflowRunView>;
  resume(request: AIWorkflowResumeClientRequest): Promise<AIWorkflowRunView>;
  get(request: AIWorkflowGetClientRequest): Promise<AIWorkflowRunView | null>;
  list(request?: AIWorkflowListClientRequest): Promise<readonly AIWorkflowRunView[]>;
  cancel(request: AIWorkflowCancelClientRequest): Promise<AIWorkflowRunView | null>;
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
    return awaitStableWorkflowRun(
      parseRun(unwrapOrThrowError(result)),
      (runId) => this.get({ runId }),
      this.polling,
    );
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
    return awaitStableWorkflowRun(
      parseRun(unwrapOrThrowError(result)),
      (runId) => this.get({ runId }),
      this.polling,
    );
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
