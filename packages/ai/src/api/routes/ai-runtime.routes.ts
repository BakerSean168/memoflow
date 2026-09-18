import { Router, type Request, type RequestHandler, type Response } from 'express';
import {
  AssistantRuntimeClientCommandSchema,
  AssistantRuntimeConversationDeleteResultSchema,
  AssistantRuntimeEventSchema,
  AssistantRuntimeHistoryClientRequestSchema,
  AssistantRuntimeHistoryViewSchema,
  AIRuntimeUsageQueryClientRequestSchema,
  AIRuntimeUsageSummarySchema,
  AIWorkflowCancelClientRequestSchema,
  AIWorkflowGetClientRequestSchema,
  AIWorkflowListClientRequestSchema,
  AIWorkflowResumeClientRequestSchema,
  AIWorkflowRunViewSchema,
  AIWorkflowStartClientRequestSchema,
  type AssistantRuntimeEvent,
} from '@memoflow/contracts/ai';
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

interface PlatformMiddleware {
  readonly auth: RequestHandler;
}

type AssistantRuntimePort = Pick<
  MastraAIRuntime,
  'dispatchMessage' | 'cancelRun' | 'listMessages' | 'deleteConversation' | 'summarizeUsage'
>;

function authenticatedIdentity(req: Request): string | undefined {
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

/**
 * Canonical AI vNext Assistant transport.
 *
 * The route owns HTTP framing only. Mastra owns run/thread state; the host owns
 * authenticated identity. No Mastra private event is serialized across the
 * product boundary.
 */
export function registerAIRuntimeRoutes(
  runtime: AssistantRuntimePort | null,
  middleware: PlatformMiddleware,
  workflowRuntime: AIWorkflowRuntimePort | null = null,
): Router {
  const router = Router();
  const { auth } = middleware;

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

    try {
      for await (const event of runtime.dispatchMessage({
        identityId,
        context: extractAiExpressExecutionContext(req),
        conversationId: parsed.data.conversationId,
        content: parsed.data.content,
        providerId: parsed.data.providerId,
        modelId: parsed.data.modelId,
        locale: parsed.data.locale,
        signal: abortController.signal,
      })) {
        if (connectionClosed || res.writableEnded) break;
        const validated: AssistantRuntimeEvent = AssistantRuntimeEventSchema.parse(event);
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
      res.status(failure.statusCode).json(
        responseBuilder.error(failure.code, failure.message, undefined, failure.context),
      );
    }
  });

  router.post('/assistant/delete', auth, async (req, res) => {
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
      const result = AssistantRuntimeConversationDeleteResultSchema.parse({
        deleted: await runtime.deleteConversation({
          identityId,
          conversationId: parsed.data.conversationId,
        }),
      });
      res.status(200).json(responseBuilder.success(result));
    } catch (error) {
      const failure = toAITransportFailure(error, {
        fallbackCode: 'AI_RUNTIME_ERROR',
        fallbackMessage: 'AI runtime request failed',
      });
      res.status(failure.statusCode).json(
        responseBuilder.error(failure.code, failure.message, undefined, failure.context),
      );
    }
  });

  router.post('/assistant/cancel', auth, (req, res) => {
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
    if (!parsed.success || parsed.data.type !== 'cancel_run') {
      const details = parsed.success
        ? [{ field: 'type', code: 'INVALID_FIELD', message: 'Expected cancel_run command' }]
        : formatZodErrors(parsed.error.issues);
      res.status(400).json(responseBuilder.validationError(details));
      return;
    }

    const cancelled = runtime.cancelRun({ identityId, runId: parsed.data.runId });
    res.status(200).json(responseBuilder.success({ cancelled }));
  });

  router.post('/usage', auth, async (req, res) => {
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
    const parsed = AIRuntimeUsageQueryClientRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(responseBuilder.validationError(formatZodErrors(parsed.error.issues)));
      return;
    }
    try {
      const summary = AIRuntimeUsageSummarySchema.parse(
        await runtime.summarizeUsage({
          identityId,
          ...(parsed.data.conversationId
            ? { conversationId: parsed.data.conversationId }
            : {}),
          ...(parsed.data.runId ? { runId: parsed.data.runId } : {}),
        }),
      );
      res.status(200).json(responseBuilder.success(summary));
    } catch (error) {
      const failure = toAITransportFailure(error, {
        fallbackCode: 'AI_RUNTIME_ERROR',
        fallbackMessage: 'AI runtime request failed',
      });
      res.status(failure.statusCode).json(
        responseBuilder.error(failure.code, failure.message, undefined, failure.context),
      );
    }
  });

  router.post('/workflow/start', auth, async (req, res) => {
    const responseBuilder = createHttpResponseBuilder(readAiExpressEnvelopeMeta(req));
    const identityId = authenticatedIdentity(req);
    if (!identityId) {
      res.status(401).json(responseBuilder.unauthorized('未授权，请登录'));
      return;
    }
    if (!workflowRuntime) {
      res
        .status(503)
        .json(responseBuilder.error('SERVICE_UNAVAILABLE', 'AI workflow runtime unavailable'));
      return;
    }
    const parsed = AIWorkflowStartClientRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(responseBuilder.validationError(formatZodErrors(parsed.error.issues)));
      return;
    }
    try {
      const run = AIWorkflowRunViewSchema.parse(
        await workflowRuntime.start({
          context: extractAiExpressExecutionContext(req),
          request: parsed.data,
        }),
      );
      res.status(200).json(responseBuilder.success(run));
    } catch (error) {
      const failure = toAITransportFailure(error, {
        fallbackCode: 'AI_WORKFLOW_RUNTIME_ERROR',
        fallbackMessage: 'Workflow failed',
      });
      res.status(failure.statusCode).json(
        responseBuilder.error(failure.code, failure.message, undefined, failure.context),
      );
    }
  });

  router.post('/workflow/resume', auth, async (req, res) => {
    const responseBuilder = createHttpResponseBuilder(readAiExpressEnvelopeMeta(req));
    const identityId = authenticatedIdentity(req);
    if (!identityId) {
      res.status(401).json(responseBuilder.unauthorized('未授权，请登录'));
      return;
    }
    if (!workflowRuntime) {
      res
        .status(503)
        .json(responseBuilder.error('SERVICE_UNAVAILABLE', 'AI workflow runtime unavailable'));
      return;
    }
    const parsed = AIWorkflowResumeClientRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(responseBuilder.validationError(formatZodErrors(parsed.error.issues)));
      return;
    }
    try {
      const run = AIWorkflowRunViewSchema.parse(
        await workflowRuntime.resume({
          context: extractAiExpressExecutionContext(req),
          request: parsed.data,
        }),
      );
      res.status(200).json(responseBuilder.success(run));
    } catch (error) {
      const failure = toAITransportFailure(error, {
        fallbackCode: 'AI_WORKFLOW_RUNTIME_ERROR',
        fallbackMessage: 'Workflow failed',
      });
      res.status(failure.statusCode).json(
        responseBuilder.error(failure.code, failure.message, undefined, failure.context),
      );
    }
  });

  router.post('/workflow/get', auth, async (req, res) => {
    const responseBuilder = createHttpResponseBuilder(readAiExpressEnvelopeMeta(req));
    const identityId = authenticatedIdentity(req);
    if (!identityId) {
      res.status(401).json(responseBuilder.unauthorized('未授权，请登录'));
      return;
    }
    if (!workflowRuntime) {
      res
        .status(503)
        .json(responseBuilder.error('SERVICE_UNAVAILABLE', 'AI workflow runtime unavailable'));
      return;
    }
    const parsed = AIWorkflowGetClientRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(responseBuilder.validationError(formatZodErrors(parsed.error.issues)));
      return;
    }
    try {
      const run = await workflowRuntime.get({ identityId, runId: parsed.data.runId });
      res
        .status(200)
        .json(responseBuilder.success(run ? AIWorkflowRunViewSchema.parse(run) : null));
    } catch (error) {
      const failure = toAITransportFailure(error, {
        fallbackCode: 'AI_WORKFLOW_RUNTIME_ERROR',
        fallbackMessage: 'Workflow failed',
      });
      res.status(failure.statusCode).json(
        responseBuilder.error(failure.code, failure.message, undefined, failure.context),
      );
    }
  });

  router.post('/workflow/list', auth, async (req, res) => {
    const responseBuilder = createHttpResponseBuilder(readAiExpressEnvelopeMeta(req));
    const identityId = authenticatedIdentity(req);
    if (!identityId) {
      res.status(401).json(responseBuilder.unauthorized('未授权，请登录'));
      return;
    }
    if (!workflowRuntime) {
      res
        .status(503)
        .json(responseBuilder.error('SERVICE_UNAVAILABLE', 'AI workflow runtime unavailable'));
      return;
    }
    const parsed = AIWorkflowListClientRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json(responseBuilder.validationError(formatZodErrors(parsed.error.issues)));
      return;
    }
    try {
      const runs = await workflowRuntime.list({
        identityId,
        conversationId: parsed.data.conversationId,
      });
      res
        .status(200)
        .json(responseBuilder.success(runs.map((run) => AIWorkflowRunViewSchema.parse(run))));
    } catch (error) {
      const failure = toAITransportFailure(error, {
        fallbackCode: 'AI_WORKFLOW_RUNTIME_ERROR',
        fallbackMessage: 'Workflow failed',
      });
      res.status(failure.statusCode).json(
        responseBuilder.error(failure.code, failure.message, undefined, failure.context),
      );
    }
  });

  router.post('/workflow/cancel', auth, async (req, res) => {
    const responseBuilder = createHttpResponseBuilder(readAiExpressEnvelopeMeta(req));
    const identityId = authenticatedIdentity(req);
    if (!identityId) {
      res.status(401).json(responseBuilder.unauthorized('未授权，请登录'));
      return;
    }
    if (!workflowRuntime) {
      res
        .status(503)
        .json(responseBuilder.error('SERVICE_UNAVAILABLE', 'AI workflow runtime unavailable'));
      return;
    }
    const parsed = AIWorkflowCancelClientRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(responseBuilder.validationError(formatZodErrors(parsed.error.issues)));
      return;
    }
    try {
      const run = await workflowRuntime.cancel({ identityId, runId: parsed.data.runId });
      res
        .status(200)
        .json(responseBuilder.success(run ? AIWorkflowRunViewSchema.parse(run) : null));
    } catch (error) {
      const failure = toAITransportFailure(error, {
        fallbackCode: 'AI_WORKFLOW_RUNTIME_ERROR',
        fallbackMessage: 'Workflow failed',
      });
      res.status(failure.statusCode).json(
        responseBuilder.error(failure.code, failure.message, undefined, failure.context),
      );
    }
  });

  return router;
}
