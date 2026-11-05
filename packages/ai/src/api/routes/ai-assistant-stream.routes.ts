import type { ConversationEventSource } from '../../server/domain/repositories/conversation-events.port';
import type { Request, RequestHandler, Response, Router } from 'express';
import {
  AssistantRuntimeClientCommandSchema as AnyAssistantRuntimeClientCommandSchema,
  AssistantRuntimeEventSchema,
  AssistantRuntimeHistoryClientRequestSchema as AnyAssistantRuntimeHistoryClientRequestSchema,
  AssistantRuntimeHistoryViewSchema,
  type AssistantRuntimeEvent,
} from '@memoflow/ai-contracts';
import { createHttpResponseBuilder, formatZodErrors } from '@memoflow/utils/result';
import {
  AssistantConversationUnavailableError,
  type AIWorkflowRuntimePort,
  type MastraAIRuntime,
} from '../../server/mastra/runtime';
import {
  extractAiExpressExecutionContext,
  readAiExpressEnvelopeMeta,
} from '../../shared/express-execution-context';
import { toAITransportFailure } from '../../server/transport';
import type { IConversationAttentionPort } from '../../server/application/ports/conversation-attention.port';
import { ConversationAttentionObserver } from '../../server/application/services/conversation-attention-observer';
import { workspaceEventStream } from '../../server/transport/workspace-event-stream';
import { once } from 'node:events';

// HTTP hosts only own built-in conversations; a Desktop reference never falls back.
// Shared with the assistant control surface, which parses the same client envelopes.
export const AssistantRuntimeClientCommandSchema = AnyAssistantRuntimeClientCommandSchema.refine(
  (command) =>
    command.type === 'tool_approval' ||
    command.type === 'tool_answer' ||
    command.runtimeKind !== 'local_agent',
  'Local Agent execution requires Desktop',
);
export const AssistantRuntimeHistoryClientRequestSchema =
  AnyAssistantRuntimeHistoryClientRequestSchema.refine(
    (request) => request.runtimeKind !== 'local_agent',
    'Local Agent history belongs to its Desktop Profile',
  );

type AssistantStreamRuntimePort = Pick<
  MastraAIRuntime,
  'dispatchMessage' | 'listMessages' | 'listAskUserSuspensions'
>;

interface AssistantStreamRouteDependencies {
  readonly runtime: AssistantStreamRuntimePort | null;
  readonly workflowRuntime: AIWorkflowRuntimePort | null;
  readonly attentionPort: IConversationAttentionPort | null;
  readonly conversationEvents?: ConversationEventSource;
}

/** Host-owned identity shared by every AI runtime surface module. */
export function authenticatedIdentity(req: Request): string | undefined {
  return (req as Request & { user?: { identityId?: string } }).user?.identityId;
}

function writeRuntimeSse(res: Response, event: 'runtime' | 'error', data: unknown): boolean {
  if (res.writableEnded) return false;
  try {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    return true;
  } catch {
    return false;
  }
}

export function registerAIAssistantStreamRoutes(
  router: Router,
  deps: AssistantStreamRouteDependencies,
  auth: RequestHandler,
): void {
  const { runtime, workflowRuntime, attentionPort, conversationEvents } = deps;
  const attentionObserver = attentionPort ? new ConversationAttentionObserver(attentionPort) : null;

  router.get('/workspace/sse', auth, async (req, res) => {
    const responseBuilder = createHttpResponseBuilder(readAiExpressEnvelopeMeta(req));
    const identityId = authenticatedIdentity(req);
    if (!identityId) {
      res.status(401).json(responseBuilder.unauthorized('未授权，请登录'));
      return;
    }
    const cursor = req.header('Last-Event-ID') ?? req.query.cursor;
    if (cursor !== undefined && (typeof cursor !== 'string' || cursor.length > 2048)) {
      res.status(400).json(responseBuilder.error('VALIDATION_ERROR', 'Invalid workspace cursor'));
      return;
    }
    let source;
    try {
      source = await workflowRuntime?.goalEvents?.();
      await attentionPort?.events?.init();
      await conversationEvents?.init();
    } catch {
      res
        .status(503)
        .json(responseBuilder.error('SERVICE_UNAVAILABLE', 'Workspace events unavailable'));
      return;
    }
    if (!source && !attentionPort?.events && !conversationEvents) {
      res
        .status(503)
        .json(responseBuilder.error('SERVICE_UNAVAILABLE', 'Workspace events unavailable'));
      return;
    }
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
    const controller = new AbortController();
    const close = () => controller.abort();
    req.on('aborted', close);
    res.on('close', close);
    const heartbeat = setInterval(() => {
      if (!res.writableEnded && !res.write(': heartbeat\n\n')) close();
    }, 15_000);
    try {
      for await (const event of workspaceEventStream({
        source: source ?? null,
        attention: attentionPort?.events,
        conversations: conversationEvents,
        identityId,
        cursor,
        signal: controller.signal,
      })) {
        if (controller.signal.aborted || res.writableEnded) break;
        if (
          !res.write(`id: ${event.cursor}\nevent: workspace\ndata: ${JSON.stringify(event)}\n\n`)
        ) {
          await once(res, 'drain', { signal: controller.signal });
        }
      }
    } catch {
      /* Disconnects recover through the persisted cursor, never a fabricated business failure. */
    } finally {
      clearInterval(heartbeat);
      close();
      req.removeListener('aborted', close);
      res.removeListener('close', close);
      if (!res.writableEnded) res.end();
    }
  });

  router.post('/assistant/sse', auth, async (req, res) => {
    const responseBuilder = createHttpResponseBuilder(readAiExpressEnvelopeMeta(req));
    const identityId = authenticatedIdentity(req);
    if (!identityId) {
      res.status(401).json(responseBuilder.unauthorized('未授权，请登录'));
      return;
    }
    if (!runtime) {
      res.status(503).json(responseBuilder.error('SERVICE_UNAVAILABLE', 'AI runtime unavailable'));
      return;
    }

    const parsed = AssistantRuntimeClientCommandSchema.safeParse(req.body);
    if (!parsed.success || parsed.data.type !== 'message') {
      const details = parsed.success
        ? [{ field: 'type', code: 'INVALID_FIELD', message: 'Expected message command' }]
        : formatZodErrors(parsed.error.issues);
      res.status(400).json(responseBuilder.validationError(details));
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const abortController = new AbortController();
    let connectionClosed = false;
    const close = () => {
      connectionClosed = true;
      abortController.abort();
    };
    req.on('aborted', close);
    res.on('close', close);
    const conversationId = parsed.data.conversationId;
    const pulse = attentionObserver
      ? setInterval(() => {
          void attentionObserver
            .heartbeat(identityId, 'builtin', conversationId)
            .catch(() => undefined);
        }, 30_000)
      : null;

    try {
      for await (const event of runtime.dispatchMessage({
        identityId,
        context: extractAiExpressExecutionContext(req),
        conversationId: parsed.data.conversationId,
        content: parsed.data.content,
        providerId: parsed.data.providerId,
        modelId: parsed.data.modelId,
        agentInstanceId: parsed.data.agentInstanceId,
        conversationBusinessPreset: parsed.data.conversationBusinessPreset,
        permissionMode: parsed.data.permissionMode,
        locale: parsed.data.locale,
        attachments: parsed.data.attachments,
        selectedEntities: parsed.data.selectedEntities,
        signal: abortController.signal,
      })) {
        if (connectionClosed || res.writableEnded) break;
        const validated: AssistantRuntimeEvent = AssistantRuntimeEventSchema.parse(event);
        await attentionObserver?.observe(identityId, 'builtin', validated).catch(() => undefined);
        if (!writeRuntimeSse(res, 'runtime', validated)) {
          close();
          break;
        }
      }
    } catch (error) {
      if (!connectionClosed && !abortController.signal.aborted) {
        const failure = toAITransportFailure(error, {
          fallbackCode: 'AI_RUNTIME_TRANSPORT_ERROR',
          fallbackMessage: 'AI runtime request failed',
        });
        writeRuntimeSse(res, 'error', {
          code: failure.code,
          message: failure.message,
        });
      }
    } finally {
      if (pulse) clearInterval(pulse);
      req.removeListener('aborted', close);
      res.removeListener('close', close);
      if (!res.writableEnded) res.end();
    }
  });

  router.post('/assistant/history', auth, async (req, res) => {
    const responseBuilder = createHttpResponseBuilder(readAiExpressEnvelopeMeta(req));
    const identityId = authenticatedIdentity(req);
    if (!identityId) {
      res.status(401).json(responseBuilder.unauthorized('未授权，请登录'));
      return;
    }
    if (!runtime) {
      res.status(503).json(responseBuilder.error('SERVICE_UNAVAILABLE', 'AI runtime unavailable'));
      return;
    }

    const parsed = AssistantRuntimeHistoryClientRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(responseBuilder.validationError(formatZodErrors(parsed.error.issues)));
      return;
    }

    try {
      const history = AssistantRuntimeHistoryViewSchema.parse(
        await runtime.listMessages({
          identityId,
          conversationId: parsed.data.conversationId,
        }),
      );
      res.status(200).json(responseBuilder.success(history));
    } catch (error) {
      if (error instanceof AssistantConversationUnavailableError) {
        res.status(404).json(responseBuilder.error('NOT_FOUND', 'Conversation not found'));
        return;
      }
      const failure = toAITransportFailure(error, {
        fallbackCode: 'AI_RUNTIME_ERROR',
        fallbackMessage: 'AI runtime request failed',
      });
      res
        .status(failure.statusCode)
        .json(
          responseBuilder.error(
            failure.code,
            failure.message,
            undefined,
            failure.context,
            failure.failure,
          ),
        );
    }
  });

  router.post('/assistant/ask-user/pending', auth, async (req, res) => {
    const responseBuilder = createHttpResponseBuilder(readAiExpressEnvelopeMeta(req));
    const identityId = authenticatedIdentity(req);
    if (!identityId) {
      res.status(401).json(responseBuilder.unauthorized('未授权，请登录'));
      return;
    }
    if (!runtime) {
      res.status(503).json(responseBuilder.error('SERVICE_UNAVAILABLE', 'AI runtime unavailable'));
      return;
    }
    const parsed = AssistantRuntimeHistoryClientRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(responseBuilder.validationError(formatZodErrors(parsed.error.issues)));
      return;
    }
    try {
      res.status(200).json(
        responseBuilder.success(
          await runtime.listAskUserSuspensions({
            identityId,
            conversationId: parsed.data.conversationId,
          }),
        ),
      );
    } catch (error) {
      const failure = toAITransportFailure(error, {
        fallbackCode: 'AI_RUNTIME_ERROR',
        fallbackMessage: 'AI runtime request failed',
      });
      res
        .status(failure.statusCode)
        .json(
          responseBuilder.error(
            failure.code,
            failure.message,
            undefined,
            failure.context,
            failure.failure,
          ),
        );
    }
  });
}
