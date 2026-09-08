import { Agent } from '@mastra/core/agent';
import type { RequestContext } from '@mastra/core/request-context';
import {
  TaskPlanningDecisionSchema,
  type TaskClarificationState,
  type TaskCreateWorkflowInput,
  type TaskPlanDraft,
  type TaskPlanningDecision,
} from '@memoflow/contracts/ai';
import type { IAIExecutionLogPort } from '../../application/ports';
import type { MastraModelResolver } from '../models/model-resolver';
import {
  normalizeMastraGenerateUsage,
  recordPlannerExecution,
  rememberResolvedPlannerModel,
} from './planner-observability';

function stringContext(requestContext: RequestContext, key: string): string | undefined {
  const value = requestContext.getRaw(key);
  return typeof value === 'string' && value.trim() ? value : undefined;
}

export type TaskPlannerMode = 'initial' | 'revise' | 'regenerate';

export interface TaskPlannerRequest {
  readonly input: TaskCreateWorkflowInput;
  readonly clarification: TaskClarificationState;
  readonly mode: TaskPlannerMode;
  readonly currentDraft?: TaskPlanDraft;
  readonly instruction?: string;
  readonly forceDraft?: boolean;
}

export interface TaskPlannerPort {
  plan(request: TaskPlannerRequest, requestContext: RequestContext): Promise<TaskPlanningDecision>;
}

/**
 * Internal Mastra worker for `task.create`. It can reason and produce a typed
 * draft, but it owns no product mutation capability and is never exposed as a
 * user-facing Agent identity.
 */
export class TaskPlannerWorker implements TaskPlannerPort {
  readonly agent: Agent<'task-planner-worker'>;

  constructor(
    modelResolver: MastraModelResolver,
    private readonly executionLogPort?: IAIExecutionLogPort,
  ) {
    this.agent = new Agent({
      id: 'task-planner-worker',
      name: 'Task Planner Worker',
      description: 'Internal structured planner used only by the task.create durable workflow.',
      instructions: ({ requestContext }) => {
        const locale = stringContext(requestContext, 'locale');
        const language = locale === 'en-US' ? 'English' : 'Simplified Chinese';
        return [
          'You are an internal MemoFlow planning worker. You are not a user-facing assistant.',
          'Return only the requested structured planning decision. Never claim that any Task has been created.',
          'You have no write tools. Product mutation occurs only after explicit workflow approval.',
          'Ask clarification only when missing information materially blocks a safe, useful plan. Ask at most 3 concise questions.',
          'Prefer a concrete draft over cosmetic clarification. The workflow enforces a maximum of 3 clarification rounds.',
          'Use epoch milliseconds for dates. Never infer a server-local timezone; preserve the provided timezone or use explicit UTC when the user supplied no local timezone.',
          'Weekly tasks must provide daysOfWeek using 0=Sunday through 6=Saturday.',
          'Use only current Task semantics: never propose folders, dependency graphs, critical paths or other retired project-management fields.',
          'A Goal link requires both goalId and keyResultId. Leave both null when the task is not linked to a specific Key Result.',
          'contributionValue is optional. Leave it null unless the user wants Task completion to automatically contribute a positive amount to the linked Key Result.',
          'Use labels only as human-readable Shared Label names. Never invent label IDs and never emit legacy Task tags or custom Task colors.',
          `Write user-visible titles, explanations and questions in ${language}.`,
        ].join('\n');
      },
      model: async ({ requestContext }) => {
        const identityId = stringContext(requestContext, 'identityId');
        if (!identityId) throw new Error('Task Planner requires authenticated identityId');
        const resolved = await modelResolver.resolve({
          identityId,
          providerId: stringContext(requestContext, 'providerId'),
          modelId: stringContext(requestContext, 'modelId'),
        });
        rememberResolvedPlannerModel(requestContext, resolved);
        return resolved.model;
      },
    });
  }

  async plan(
    request: TaskPlannerRequest,
    requestContext: RequestContext,
  ): Promise<TaskPlanningDecision> {
    const prompt = [
      'Produce the next task.create planning decision from this trusted workflow state.',
      request.forceDraft
        ? 'Clarification budget is exhausted. You MUST return status=draft_ready using the best safe assumptions and record assumptions in warnings.'
        : 'Return needs_clarification only for a material blocker; otherwise return draft_ready.',
      `Mode: ${request.mode}`,
      request.instruction ? `Revision instruction: ${request.instruction}` : '',
      'Workflow input JSON:',
      JSON.stringify(request.input),
      'Clarification history JSON:',
      JSON.stringify(request.clarification),
      'Current draft JSON:',
      JSON.stringify(request.currentDraft ?? null),
      request.mode === 'regenerate'
        ? 'Regenerate the plan substantively rather than making only cosmetic edits.'
        : '',
      request.mode === 'revise'
        ? 'Preserve valid parts of the current draft and apply the revision instruction precisely.'
        : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    const startedAt = Date.now();
    try {
      const output = await this.agent.generate(prompt, {
        requestContext,
        structuredOutput: { schema: TaskPlanningDecisionSchema },
      });
      const decision = TaskPlanningDecisionSchema.parse(output.object);
      await recordPlannerExecution(this.executionLogPort, {
        identityId: request.input.identityId,
        conversationId: request.input.conversationId,
        requestContext,
        taskType: 'MASTRA_TASK_PLANNER',
        mode: request.mode,
        status: 'COMPLETED',
        outcome: decision.status,
        usage: normalizeMastraGenerateUsage(output),
        processingMs: Date.now() - startedAt,
      });
      return decision;
    } catch (cause) {
      await recordPlannerExecution(this.executionLogPort, {
        identityId: request.input.identityId,
        conversationId: request.input.conversationId,
        requestContext,
        taskType: 'MASTRA_TASK_PLANNER',
        mode: request.mode,
        status: 'FAILED',
        processingMs: Date.now() - startedAt,
      });
      throw cause;
    }
  }
}
