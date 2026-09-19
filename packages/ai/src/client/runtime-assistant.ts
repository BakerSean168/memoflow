import {
  AssistantRuntimeCancelResultSchema,
  AssistantRuntimeClientCommandSchema,
  AssistantRuntimeConversationDeleteResultSchema,
  AssistantRuntimeEventSchema,
  AssistantRuntimeHistoryClientRequestSchema,
  AssistantRuntimeHistoryViewSchema,
  type AssistantRuntimeClientCommand,
  type AssistantRuntimeEvent,
  type AssistantRuntimeHistoryView,
} from '@memoflow/contracts/ai';
import { AIChannels, AIStreamChannels } from '@memoflow/contracts/electron';
import { unwrapOrThrowError } from '@memoflow/contracts/result';
import type { IResultHttpClient } from '@memoflow/http-client';
import type { IResultIpcClient } from '@memoflow/ipc-client';
import {
  createResultClientError,
  createResultClientErrorFromResponse,
} from '../infrastructure-client/adapters/result-client-error';
import { createStreamId } from '../shared/create-stream-id';
import { isAbortLikeError } from '../shared/is-abort-like-error';
import { lastArg } from '../shared/last-arg';
import { parseSSE } from '../shared/parse-sse';

export type AssistantRuntimeMessageCommand = Extract<
  AssistantRuntimeClientCommand,
  { type: 'message' }
>;

export interface AssistantRuntimeHandlers {
  onEvent?: (event: AssistantRuntimeEvent) => void;
}

/** Thin client-side vNext seam; no Mastra private type crosses this interface. */
export interface AssistantRuntimeClient {
  listMessages(conversationId: string): Promise<AssistantRuntimeHistoryView>;
  deleteConversation(conversationId: string): Promise<boolean>;
  streamMessage(
    command: AssistantRuntimeMessageCommand,
    handlers: AssistantRuntimeHandlers,
    signal?: AbortSignal,
  ): Promise<void>;
  cancelRun(runId: string): Promise<boolean>;
}

const TERMINAL_TYPES = new Set<AssistantRuntimeEvent['type']>([
  'assistant.run.completed',
  'assistant.run.failed',
  'assistant.run.cancelled',
]);

function validateMessageCommand(
  command: AssistantRuntimeMessageCommand,
): AssistantRuntimeMessageCommand {
  const parsed = AssistantRuntimeClientCommandSchema.safeParse(command);
  if (!parsed.success || parsed.data.type !== 'message') {
    throw createResultClientError('Invalid AI runtime message command', 'VALIDATION_ERROR');
  }
  return parsed.data;
}

function runtimeProtocolError(message: string) {
  return createResultClientError(message, 'AI_RUNTIME_PROTOCOL_ERROR');
}

function parseJson(data: string, kind: string): unknown {
  try {
    return JSON.parse(data);
  } catch {
    throw runtimeProtocolError(`AI runtime ${kind} frame is not valid JSON`);
  }
}

function parseTransportError(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    return runtimeProtocolError('AI runtime transport error frame is malformed');
  }
  const code = (payload as { code?: unknown }).code;
  const message = (payload as { message?: unknown }).message;
  if (typeof code !== 'string' || typeof message !== 'string') {
    return runtimeProtocolError('AI runtime transport error frame is malformed');
  }
  return createResultClientError(message, code);
}

export class AssistantRuntimeHttpClient implements AssistantRuntimeClient {
  private readonly historyUrl = '/ai/runtime/assistant/history';
  private readonly deleteUrl = '/ai/runtime/assistant/delete';
  private readonly streamUrl = '/ai/runtime/assistant/sse';
  private readonly cancelUrl = '/ai/runtime/assistant/cancel';

  constructor(private readonly httpClient: IResultHttpClient) {}

  async listMessages(conversationId: string): Promise<AssistantRuntimeHistoryView> {
    const request = AssistantRuntimeHistoryClientRequestSchema.parse({ conversationId });
    const result = await this.httpClient.post<unknown>(this.historyUrl, request);
    const parsed = AssistantRuntimeHistoryViewSchema.safeParse(unwrapOrThrowError(result));
    if (!parsed.success) {
      throw runtimeProtocolError('AI runtime history failed protocol validation');
    }
    return parsed.data;
  }

  async deleteConversation(conversationId: string): Promise<boolean> {
    const request = AssistantRuntimeHistoryClientRequestSchema.parse({ conversationId });
    const result = await this.httpClient.post<unknown>(this.deleteUrl, request);
    const parsed = AssistantRuntimeConversationDeleteResultSchema.safeParse(
      unwrapOrThrowError(result),
    );
    if (!parsed.success) {
      throw runtimeProtocolError('AI runtime delete failed protocol validation');
    }
    return parsed.data.deleted;
  }

  async streamMessage(
    command: AssistantRuntimeMessageCommand,
    handlers: AssistantRuntimeHandlers,
    signal?: AbortSignal,
  ): Promise<void> {
    const validatedCommand = validateMessageCommand(command);
    let response: Response;
    try {
      response = await this.httpClient.stream(this.streamUrl, {
        method: 'POST',
        body: validatedCommand,
        signal,
      });
    } catch (error) {
      if (isAbortLikeError(error) || signal?.aborted) {
        throw createResultClientError('请求已取消', 'ABORTED');
      }
      throw error;
    }

    if (!response.ok) {
      throw await createResultClientErrorFromResponse(
        response,
        `AI runtime request failed: ${response.status}`,
      );
    }

    let terminalSeen = false;
    try {
      for await (const frame of parseSSE(response)) {
        if (frame.event === 'runtime') {
          if (!frame.data) throw runtimeProtocolError('AI runtime event frame is missing data');
          const parsed = AssistantRuntimeEventSchema.safeParse(parseJson(frame.data, 'event'));
          if (!parsed.success) {
            throw runtimeProtocolError('AI runtime event failed protocol validation');
          }
          handlers.onEvent?.(parsed.data);
          if (TERMINAL_TYPES.has(parsed.data.type)) {
            terminalSeen = true;
            return;
          }
          continue;
        }

        if (frame.event === 'error') {
          throw parseTransportError(frame.data ? parseJson(frame.data, 'error') : undefined);
        }

        throw runtimeProtocolError(`AI runtime received unknown SSE event '${frame.event}'`);
      }
    } catch (error) {
      if (isAbortLikeError(error) || signal?.aborted) {
        throw createResultClientError('请求已取消', 'ABORTED');
      }
      throw error;
    }

    if (!terminalSeen) {
      throw createResultClientError(
        'AI runtime stream ended before a terminal event',
        'STREAM_TERMINATED',
      );
    }
  }

  async cancelRun(runId: string): Promise<boolean> {
    const command = AssistantRuntimeClientCommandSchema.parse({ type: 'cancel_run', runId });
    const result = await this.httpClient.post<unknown>(this.cancelUrl, command);
    const parsed = AssistantRuntimeCancelResultSchema.safeParse(unwrapOrThrowError(result));
    if (!parsed.success) {
      throw runtimeProtocolError('AI runtime cancel failed protocol validation');
    }
    return parsed.data.cancelled;
  }
}

export class AssistantRuntimeIpcClient implements AssistantRuntimeClient {
  constructor(private readonly ipcClient: IResultIpcClient) {}

  async listMessages(conversationId: string): Promise<AssistantRuntimeHistoryView> {
    const request = AssistantRuntimeHistoryClientRequestSchema.parse({ conversationId });
    const result = await this.ipcClient.invoke<unknown>(
      AIChannels.RUNTIME_ASSISTANT_HISTORY,
      request,
    );
    const parsed = AssistantRuntimeHistoryViewSchema.safeParse(unwrapOrThrowError(result));
    if (!parsed.success) {
      throw runtimeProtocolError('AI runtime history failed protocol validation');
    }
    return parsed.data;
  }

  async deleteConversation(conversationId: string): Promise<boolean> {
    const request = AssistantRuntimeHistoryClientRequestSchema.parse({ conversationId });
    const result = await this.ipcClient.invoke<unknown>(
      AIChannels.RUNTIME_ASSISTANT_DELETE,
      request,
    );
    const parsed = AssistantRuntimeConversationDeleteResultSchema.safeParse(
      unwrapOrThrowError(result),
    );
    if (!parsed.success) {
      throw runtimeProtocolError('AI runtime delete failed protocol validation');
    }
    return parsed.data.deleted;
  }

  async streamMessage(
    command: AssistantRuntimeMessageCommand,
    handlers: AssistantRuntimeHandlers,
    signal?: AbortSignal,
  ): Promise<void> {
    const validatedCommand = validateMessageCommand(command);
    const bridge = this.ipcClient.getBridge?.();
    if (!bridge) {
      throw createResultClientError(
        'AI runtime requires Desktop IPC stream bridge',
        'NOT_SUPPORTED',
      );
    }

    const streamId = createStreamId();
    let settled = false;
    let abortRequested = signal?.aborted ?? false;
    let activeRunId: string | undefined;
    let resolveStream!: () => void;
    let rejectStream!: (error: unknown) => void;
    const completion = new Promise<void>((resolve, reject) => {
      resolveStream = resolve;
      rejectStream = reject;
    });

    const cleanup = () => {
      bridge.off(AIStreamChannels.RUNTIME_ASSISTANT_EVENT, onRuntimeEvent);
      bridge.off(AIStreamChannels.RUNTIME_ASSISTANT_ERROR, onTransportError);
      signal?.removeEventListener('abort', onAbort);
    };
    const settleOk = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolveStream();
    };
    const settleError = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      rejectStream(error);
    };
    const requestRuntimeCancel = () => {
      if (!activeRunId) return;
      void this.cancelRun(activeRunId).catch(() => undefined);
    };
    const onAbort = () => {
      abortRequested = true;
      requestRuntimeCancel();
    };
    const onRuntimeEvent = (...args: unknown[]) => {
      const envelope = lastArg<{ streamId?: unknown; event?: unknown }>(args);
      if (!envelope || envelope.streamId !== streamId) return;
      const parsed = AssistantRuntimeEventSchema.safeParse(envelope.event);
      if (!parsed.success) {
        settleError(runtimeProtocolError('AI runtime IPC event failed protocol validation'));
        return;
      }
      if (parsed.data.type === 'assistant.run.started') {
        activeRunId = parsed.data.runId;
        if (abortRequested) requestRuntimeCancel();
      }
      handlers.onEvent?.(parsed.data);
      if (TERMINAL_TYPES.has(parsed.data.type)) {
        if (abortRequested) settleError(createResultClientError('请求已取消', 'ABORTED'));
        else settleOk();
      }
    };
    const onTransportError = (...args: unknown[]) => {
      const envelope = lastArg<{ streamId?: unknown; code?: unknown; message?: unknown }>(args);
      if (!envelope || envelope.streamId !== streamId) return;
      settleError(parseTransportError(envelope));
    };

    bridge.on(AIStreamChannels.RUNTIME_ASSISTANT_EVENT, onRuntimeEvent);
    bridge.on(AIStreamChannels.RUNTIME_ASSISTANT_ERROR, onTransportError);
    signal?.addEventListener('abort', onAbort, { once: true });

    try {
      const start = await this.ipcClient.invoke<void>(AIChannels.RUNTIME_ASSISTANT_START, {
        streamId,
        command: validatedCommand,
      });
      unwrapOrThrowError(start);
    } catch (error) {
      cleanup();
      throw error;
    }

    await completion;
  }

  async cancelRun(runId: string): Promise<boolean> {
    const command = AssistantRuntimeClientCommandSchema.parse({ type: 'cancel_run', runId });
    const result = await this.ipcClient.invoke<unknown>(
      AIChannels.RUNTIME_ASSISTANT_CANCEL,
      command,
    );
    const parsed = AssistantRuntimeCancelResultSchema.safeParse(unwrapOrThrowError(result));
    if (!parsed.success) {
      throw runtimeProtocolError('AI runtime cancel failed protocol validation');
    }
    return parsed.data.cancelled;
  }
}

export function createAssistantRuntimeHttpClient(
  httpClient: IResultHttpClient,
): AssistantRuntimeClient {
  return new AssistantRuntimeHttpClient(httpClient);
}

export function createAssistantRuntimeIpcClient(
  ipcClient: IResultIpcClient,
): AssistantRuntimeClient {
  return new AssistantRuntimeIpcClient(ipcClient);
}
