import { Agent } from '@mastra/core/agent';
import type { RequestContext } from '@mastra/core/request-context';
import {
  GoalPlanningDecisionSchema,
  type GoalClarificationState,
  type GoalCreateWorkflowInput,
  type GoalPlanDraft,
  type GoalPlanningDecision,
} from '@memoflow/contracts/ai';
import type { IAIExecutionLogPort } from '../../application/ports';
import type { MastraModelResolver } from '../models/model-resolver';
import {
  normalizeMastraGenerateUsage,
  recordPlannerExecution,
  rememberResolvedPlannerModel,
} from './planner-observability';
import { userTimeContextInstruction } from './user-time-context';

function stringContext(requestContext: RequestContext, key: string): string | undefined {
  const value = requestContext.getRaw(key);
  return typeof value === 'string' && value.trim() ? value : undefined;
}

export type GoalPlannerMode = 'initial' | 'revise' | 'regenerate';

export interface GoalPlannerRequest {
  readonly input: GoalCreateWorkflowInput;
  readonly clarification: GoalClarificationState;
  readonly mode: GoalPlannerMode;
  readonly currentDraft?: GoalPlanDraft;
  readonly instruction?: string;
  readonly forceDraft?: boolean;
}

export interface GoalPlannerPort {
  plan(request: GoalPlannerRequest, requestContext: RequestContext): Promise<GoalPlanningDecision>;
}

/**
 * Internal Mastra worker for ADR-052. It can reason and produce a typed draft,
 * but it owns no product mutation capability and is never exposed as a
 * user-facing Agent identity.
 */
export class GoalPlannerWorker implements GoalPlannerPort {
  readonly agent: Agent<'goal-planner-worker'>;

  constructor(
    modelResolver: MastraModelResolver,
    private readonly executionLogPort?: IAIExecutionLogPort,
  ) {
    this.agent = new Agent({
      id: 'goal-planner-worker',
      name: 'Goal Planner Worker',
      description: 'Internal structured planner used only by the goal.create durable workflow.',
      instructions: ({ requestContext }) => {
        const locale = stringContext(requestContext, 'locale') === 'en-US' ? 'en-US' : 'zh-CN';
        const language = locale === 'en-US' ? 'English' : 'Simplified Chinese';
        const timeInstruction = userTimeContextInstruction(requestContext, locale);
        return [
          'You are an internal MemoFlow planning worker. You are not a user-facing assistant.',
          'Return only the requested structured planning decision. Never claim that any Goal, Key Result, Task or Reminder has been created.',
          'You have no write tools. Product mutation occurs only after explicit workflow approval.',
          'Ask clarification only when missing information materially blocks a safe, useful plan. Ask at most 3 concise questions.',
          'Prefer a concrete draft over cosmetic clarification. The workflow enforces a maximum of 3 clarification rounds.',
          'Use epoch milliseconds for date anchors and always emit the matching IANA timezone field for generated Tasks. Preserve an explicit schedule timezone; otherwise use the canonical user timezone below.',
          timeInstruction,
          'Every task keyResultIndex must point to an existing key result. Weekly tasks must provide daysOfWeek using 0=Sunday through 6=Saturday.',
          'Every reminder should provide a deterministic first scheduledAt epoch when timing is known; timeOfDay is HH:mm and timezone is an IANA zone when known.',
          'For Goal and Task classification, use labels only as human-readable Shared Label names. Never invent label IDs or legacy Task tags/custom Task colors.',
          `Write user-visible titles, explanations and questions in ${language}.`,
        ].join('\n');
      },
      model: async ({ requestContext }) => {
        const identityId = stringContext(requestContext, 'identityId');
        if (!identityId) throw new Error('Goal Planner requires authenticated identityId');
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
    request: GoalPlannerRequest,
    requestContext: RequestContext,
  ): Promise<GoalPlanningDecision> {
    const prompt = [
      'Produce the next goal.create planning decision from this trusted workflow state.',
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
        structuredOutput: { schema: GoalPlanningDecisionSchema },
      });
      const decision = GoalPlanningDecisionSchema.parse(output.object);
      await recordPlannerExecution(this.executionLogPort, {
        identityId: request.input.identityId,
        conversationId: request.input.conversationId,
        requestContext,
        taskType: 'MASTRA_GOAL_PLANNER',
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
        taskType: 'MASTRA_GOAL_PLANNER',
        mode: request.mode,
        status: 'FAILED',
        processingMs: Date.now() - startedAt,
      });
      throw cause;
    }
  }
}
