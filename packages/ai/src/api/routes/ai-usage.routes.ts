import type { RequestHandler, Router } from 'express';
import {
  AIRuntimeUsageQueryClientRequestSchema,
  AIRuntimeUsageSummarySchema,
} from '@memoflow/ai-contracts';
import { createHttpResponseBuilder, formatZodErrors } from '@memoflow/utils/result';
import type { MastraAIRuntime } from '../../server/mastra/runtime';
import { readAiExpressEnvelopeMeta } from '../../shared/express-execution-context';
import { toAITransportFailure } from '../../server/transport';
import { authenticatedIdentity } from './ai-assistant-stream.routes';

type AIUsageRuntimePort = Pick<MastraAIRuntime, 'summarizeUsage'>;

interface AIUsageRouteDependencies {
  readonly runtime: AIUsageRuntimePort | null;
}

export function registerAIUsageRoutes(
  router: Router,
  deps: AIUsageRouteDependencies,
  auth: RequestHandler,
): void {
  const { runtime } = deps;

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
          ...(parsed.data.conversationId ? { conversationId: parsed.data.conversationId } : {}),
          ...(parsed.data.runId ? { runId: parsed.data.runId } : {}),
        }),
      );
      res.status(200).json(responseBuilder.success(summary));
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
