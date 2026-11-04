import type { RequestHandler, Router } from 'express';
import {
  AIWorkflowCancelClientRequestSchema,
  AIGoalSurfaceLeaseRequestSchema,
  AIGoalSurfaceLeaseResponseSchema,
  AIWorkflowGetClientRequestSchema,
  AIWorkflowListClientRequestSchema,
  AIWorkflowResumeClientRequestSchema,
  AIWorkflowRunViewSchema,
  AIWorkflowStartClientRequestSchema,
} from '@memoflow/ai-contracts';
import { createHttpResponseBuilder, formatZodErrors } from '@memoflow/utils/result';
import type { AIWorkflowRuntimePort } from '../../server/mastra/runtime';
import {
  extractAiExpressExecutionContext,
  readAiExpressEnvelopeMeta,
} from '../../shared/express-execution-context';
import { toAITransportFailure } from '../../server/transport';
import { authenticatedIdentity } from './ai-assistant-stream.routes';

interface AIWorkflowRouteDependencies {
  readonly workflowRuntime: AIWorkflowRuntimePort | null;
}

export function registerAIWorkflowRoutes(
  router: Router,
  deps: AIWorkflowRouteDependencies,
  auth: RequestHandler,
): void {
  const { workflowRuntime } = deps;

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
        await workflowRuntime.startDetached({
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
        await workflowRuntime.resumeDetached({
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

  router.post('/workflow/goal-surface-lease', auth, async (req, res) => {
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
    const parsed = AIGoalSurfaceLeaseRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(responseBuilder.validationError(formatZodErrors(parsed.error.issues)));
      return;
    }
    try {
      const result = AIGoalSurfaceLeaseResponseSchema.parse(
        await workflowRuntime.goalSurfaceLease({ identityId, request: parsed.data }),
      );
      res.status(200).json(responseBuilder.success(result));
    } catch (error) {
      const failure = toAITransportFailure(error, {
        fallbackCode: 'AI_WORKFLOW_RUNTIME_ERROR',
        fallbackMessage: 'Goal surface lease failed',
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
