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
  aiContextInstruction,
  setAIContextRequestContext,
  type AIContextAssemblerPort,
} from '../context';
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
    private readonly executionLogPort: IAIExecutionLogPort | undefined,
    private readonly contextAssembler: AIContextAssemblerPort,
  ) {
    this.agent = new Agent({
      id: 'task-planner-worker',
      name: 'Task Planner Worker',
      description: 'Internal structured planner used only by the task.create durable workflow.',
      instructions: ({ requestContext }) => {
        const locale = stringContext(requestContext, 'locale') === 'en-US' ? 'en-US' : 'zh-CN';
        const language = locale === 'en-US' ? 'English' : 'Simplified Chinese';
        return [
          'You are an internal MemoFlow planning worker. You are not a user-facing assistant.',
          'Return only the requested structured planning decision. Never claim that any Task has been created.',
          'You have no write tools. Product mutation occurs only after explicit workflow approval.',
          'Ask clarification only when missing information materially blocks a safe, useful plan. Ask at most 3 concise questions.',
          'Prefer a concrete draft over cosmetic clarification. The workflow enforces a maximum of 3 clarification rounds.',
          'Use the canonical TaskPlanSchedule union directly: OneTime uses date + timing; Recurring uses startDate + timing + recurrence. Never emit a legacy recurrence, epoch date or timezone DSL.',
          'The canonical Product Time context is supplied in the validated AI context envelope. Do not infer semantic time from the server host or an ambient timezone.',
          'Weekly TaskPlanSchedule recurrence must provide byWeekday using the owner DayOfWeek values 0=Sunday through 6=Saturday.',
          'Use only current Task semantics: never propose folders, dependency graphs, critical paths or other retired project-management fields.',
          'A Task may use goalBinding with only goalId, or with goalId + keyResultId. A contribution is valid only when both owner IDs are present.',
          'Pass reminderConfig through the canonical Task owner contract when a reminder is genuinely requested; never emit a legacy reminder template.',
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
          executionRequirement: {
            chat: 'required',
            structuredOutput: 'required',
          },
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
    const contextEnvelope = await this.contextAssembler.assemble({
      invocation: {
        identityId: request.input.identityId,
        conversationId: request.input.conversationId,
        surface: 'task.create',
        locale: request.input.locale,
      },
      userInput: {
        idea: request.input.idea,
        goalId: request.input.goalId,
        surfaceContext: request.input.surfaceContext,
        clarification: request.clarification,
      },
      selectedEntities: request.input.goalId
        ? [
            {
              entityType: 'goal',
              id: request.input.goalId,
              source: 'workflow.task.create.input',
            },
          ]
        : undefined,
      workflowInstructions: [
        {
          id: 'task.create.control',
          source: 'workflow.task.create',
          content: {
            mode: request.mode,
            forceDraft: request.forceDraft ?? false,
            instruction: request.instruction,
          },
          sensitivity: 'private',
        },
      ],
      domainFacts: request.currentDraft
        ? [
            {
              id: 'task.create.current-draft',
              source: 'workflow.task.create.state',
              content: request.currentDraft,
              sensitivity: 'private',
            },
          ]
        : undefined,
    });
    setAIContextRequestContext(requestContext, contextEnvelope);
    const prompt = [
      'Produce the next task.create planning decision from this trusted workflow state.',
      'Follow the mode, forceDraft, revision instruction and clarification controls in the workflow section of the canonical context envelope. Ask only material blockers; when forceDraft is true, return draft_ready using safe assumptions and record them in warnings. Regenerate substantively and revise precisely while preserving valid draft parts.',
      aiContextInstruction(contextEnvelope),
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
