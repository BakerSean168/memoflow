import type { RequestHandler, Router } from 'express';
import {
  AssistantRuntimeApprovalCommandSchema,
  AssistantAttentionListRequestSchema,
  AssistantAttentionListResponseSchema,
  AssistantAttentionAckRequestSchema,
  AssistantAttentionAckResponseSchema,
  AssistantRuntimeApprovalResultSchema,
  AssistantRuntimeCancelResultSchema,
  AssistantRuntimeConversationDeleteResultSchema,
  AssistantRuntimeToolAnswerCommandSchema,
  AssistantRuntimeToolAnswerResultSchema,
} from '@memoflow/ai-contracts';
import { createHttpResponseBuilder, formatZodErrors } from '@memoflow/utils/result';
import type { MastraAIRuntime } from '../../server/mastra/runtime';
import {
  extractAiExpressExecutionContext,
  readAiExpressEnvelopeMeta,
} from '../../shared/express-execution-context';
import { toAITransportFailure } from '../../server/transport';
import type { IConversationAttentionPort } from '../../server/application/ports/conversation-attention.port';
import {
  AssistantRuntimeClientCommandSchema,
  AssistantRuntimeHistoryClientRequestSchema,
  authenticatedIdentity,
} from './ai-assistant-stream.routes';

type AssistantControlRuntimePort = Pick<
  MastraAIRuntime,
  'answerToolSuspension' | 'decideToolApproval' | 'deleteConversation' | 'cancelRun'
>;

interface AssistantControlRouteDependencies {
  readonly runtime: AssistantControlRuntimePort | null;
  readonly attentionPort: IConversationAttentionPort | null;
}

export function registerAIAssistantControlRoutes(
  router: Router,
  deps: AssistantControlRouteDependencies,
  auth: RequestHandler,
): void {
  const { runtime, attentionPort } = deps;

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
      await attentionPort
        ?.forget({ identityId, runtimeKind: 'builtin', conversationId: parsed.data.conversationId })
        .catch(() => undefined);
      res.status(200).json(responseBuilder.success(result));
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

  router.post('/assistant/answer', auth, async (req, res) => {
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
    const parsed = AssistantRuntimeToolAnswerCommandSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(responseBuilder.validationError(formatZodErrors(parsed.error.issues)));
      return;
    }
    try {
      const accepted = await runtime.answerToolSuspension({
        context: extractAiExpressExecutionContext(req),
        command: parsed.data,
      });
      res
        .status(200)
        .json(responseBuilder.success(AssistantRuntimeToolAnswerResultSchema.parse({ accepted })));
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

  router.post('/assistant/attention/list', auth, async (req, res) => {
    const reply = createHttpResponseBuilder(readAiExpressEnvelopeMeta(req));
    const identityId = authenticatedIdentity(req);
    if (!identityId) return void res.status(401).json(reply.unauthorized('Unauthorized'));
    if (!attentionPort)
      return void res.status(503).json(reply.error('SERVICE_UNAVAILABLE', 'Attention unavailable'));
    const parsed = AssistantAttentionListRequestSchema.safeParse(req.body);
    if (!parsed.success || parsed.data.runtimeKind !== 'builtin')
      return void res
        .status(400)
        .json(
          reply.validationError(
            parsed.success
              ? [{ field: 'runtimeKind', code: 'INVALID_FIELD', message: 'Desktop only' }]
              : formatZodErrors(parsed.error.issues),
          ),
        );
    try {
      const items = await attentionPort.list({
        identityId,
        runtimeKind: 'builtin',
        conversationIds: parsed.data.conversationIds,
      });
      res.status(200).json(reply.success(AssistantAttentionListResponseSchema.parse({ items })));
    } catch (error) {
      const failure = toAITransportFailure(error, {
        fallbackCode: 'AI_RUNTIME_ERROR',
        fallbackMessage: 'Attention read failed',
      });
      res.status(failure.statusCode).json(reply.error(failure.code, failure.message));
    }
  });

  router.post('/assistant/attention/ack', auth, async (req, res) => {
    const reply = createHttpResponseBuilder(readAiExpressEnvelopeMeta(req));
    const identityId = authenticatedIdentity(req);
    if (!identityId) return void res.status(401).json(reply.unauthorized('Unauthorized'));
    if (!attentionPort)
      return void res.status(503).json(reply.error('SERVICE_UNAVAILABLE', 'Attention unavailable'));
    const parsed = AssistantAttentionAckRequestSchema.safeParse(req.body);
    if (!parsed.success || parsed.data.runtimeKind !== 'builtin')
      return void res
        .status(400)
        .json(
          reply.validationError(
            parsed.success
              ? [{ field: 'runtimeKind', code: 'INVALID_FIELD', message: 'Desktop only' }]
              : formatZodErrors(parsed.error.issues),
          ),
        );
    try {
      const acknowledged = await attentionPort.acknowledge({ identityId, ...parsed.data });
      res
        .status(200)
        .json(reply.success(AssistantAttentionAckResponseSchema.parse({ acknowledged })));
    } catch (error) {
      const failure = toAITransportFailure(error, {
        fallbackCode: 'AI_RUNTIME_ERROR',
        fallbackMessage: 'Attention acknowledgement failed',
      });
      res.status(failure.statusCode).json(reply.error(failure.code, failure.message));
    }
  });

  router.post('/assistant/approval', auth, async (req, res) => {
    const responseBuilder = createHttpResponseBuilder(readAiExpressEnvelopeMeta(req));
    if (!authenticatedIdentity(req)) {
      res.status(401).json(responseBuilder.unauthorized('未授权，请登录'));
      return;
    }
    if (!runtime) {
      res.status(503).json(responseBuilder.error('SERVICE_UNAVAILABLE', 'AI runtime unavailable'));
      return;
    }
    const parsed = AssistantRuntimeApprovalCommandSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(responseBuilder.validationError(formatZodErrors(parsed.error.issues)));
      return;
    }
    try {
      const accepted = await runtime.decideToolApproval({
        context: extractAiExpressExecutionContext(req),
        command: parsed.data,
      });
      res
        .status(200)
        .json(responseBuilder.success(AssistantRuntimeApprovalResultSchema.parse({ accepted })));
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
    res
      .status(200)
      .json(responseBuilder.success(AssistantRuntimeCancelResultSchema.parse({ cancelled })));
  });
}
