import {
  applyMemoFlowSessionToolPolicy,
  memoFlowToolCategory,
  memoFlowToolPolicy,
} from '../tools/product-tool-policy';
import { randomUUID } from 'node:crypto';
import { AgentController } from '@mastra/core/agent-controller';
import type { AgentControllerEvent } from '@mastra/core/agent-controller';
import { Mastra } from '@mastra/core/mastra';
import {
  MASTRA_RESOURCE_ID_KEY,
  MASTRA_THREAD_ID_KEY,
  RequestContext,
} from '@mastra/core/request-context';
import type { MastraCompositeStore } from '@mastra/core/storage';
import { Memory } from '@mastra/memory';
import {
  AssistantToolNameSchema,
  type AssistantRuntimeApprovalCommand,
  AIWorkflowRunViewSchema,
  AIWorkflowSuspensionSchema,
  GoalCreateWorkflowInputSchema,
  KnowledgeCaptureWorkflowInputSchema,
  TaskCreateWorkflowInputSchema,
  type AIWorkflowResumeClientRequest,
  type AIWorkflowRunView,
  type AIWorkflowStartClientRequest,
  type AssistantRuntimeAttachment,
  type AssistantRuntimeEvent,
  type AssistantRuntimeHistoryView,
  type AssistantRuntimeSelectedEntity,
} from '@memoflow/contracts/ai';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import type {
  AIUsageSummary,
  IAIExecutionRecordPort,
  IAIUsageReadPort,
  IAIRoutineCommandPort,
  IAIPlannerReadPort,
  IAINotificationReadPort,
  IAISelectedEntityContextReadPort,
  IAIWebResearchPort,
  IAnalyticsReadPort,
} from '../../application/ports';
import {
  createMemoFlowAssistant,
  GoalPlannerWorker,
  KnowledgeCapturePlannerWorker,
  TaskPlannerWorker,
} from '../agents';
import { createMemoFlowProductTools } from '../tools/product-tools';
import type { MastraModelResolver } from '../models';
import {
  AssistantSelectedContextHydrator,
  setAIContextRequestContext,
  type AIContextAssemblerPort,
} from '../context';
import {
  ApplyGoalPlanService,
  GOAL_CREATE_LIFECYCLE_STEP_ID,
  GOAL_CREATE_WORKFLOW_ID,
  GoalCreateWorkflowOutputSchema,
  createGoalCreateWorkflow,
  initialGoalCreateWorkflowState,
  type GoalPlanMutationPort,
  ApplyTaskPlanService,
  TASK_CREATE_LIFECYCLE_STEP_ID,
  TASK_CREATE_WORKFLOW_ID,
  TaskCreateWorkflowOutputSchema,
  createTaskCreateWorkflow,
  initialTaskCreateWorkflowState,
  type TaskPlanMutationPort,
  ApplyKnowledgeNoteService,
  KNOWLEDGE_CAPTURE_LIFECYCLE_STEP_ID,
  KNOWLEDGE_CAPTURE_WORKFLOW_ID,
  KnowledgeCaptureWorkflowOutputSchema,
  createKnowledgeCaptureWorkflow,
  initialKnowledgeCaptureWorkflowState,
  type KnowledgeCaptureMutationPort,
} from '../workflows';
import { AsyncEventQueue } from './async-event-queue';
import {
  createAssistantExecutionRecord,
  createAssistantPhaseExecutionRecord,
  projectAssistantUsage,
  type AssistantUsageSnapshot,
} from './assistant-observability';
import { AssistantHistoryService } from './assistant-history.service';
import type { AssistantConversationShellSource } from './assistant-conversation-shell.port';
import type { AIWorkflowRuntimePort } from './workflow-runtime.port';
import { toAIPublicFailure } from '../../../shared/ai-public-failure';

function messageText(event: Extract<AgentControllerEvent, { type: 'message_start' }>): string {
  const parts = event.message.content.parts;
  return parts
    .filter(
      (part): part is typeof part & { type: 'text'; text: string } =>
        part.type === 'text' && 'text' in part && typeof part.text === 'string',
    )
    .map((part) => part.text)
    .join('');
}

function publicRuntimeError(error?: unknown): { code: string; message: string } {
  const failure = toAIPublicFailure(error, {
    fallbackCode: 'AI_RUNTIME_TRANSPORT_ERROR',
    fallbackMessage: 'AI runtime request failed',
  });
  return { code: failure.code, message: failure.message };
}

export interface MastraAIRuntimeDependencies {
  readonly storage: MastraCompositeStore;
  readonly modelResolver: MastraModelResolver;
  readonly conversationShellSource: AssistantConversationShellSource;
  /** Host-bound canonical Goal/Task/Reminder application mutations for ADR-052. */
  readonly goalPlanMutationPort: GoalPlanMutationPort;
  /** Host-bound canonical Task application mutation for the task.create workflow. */
  readonly taskPlanMutationPort: TaskPlanMutationPort;
  /** Host-bound canonical knowledge-note persistence mutation for knowledge.capture. */
  readonly knowledgeCaptureMutationPort: KnowledgeCaptureMutationPort;
  /** Existing Knowledge read owner reused by GoalPlan V2 for search/reuse evidence. */
  readonly knowledgeSourcePort: import('../../application/ports').IKnowledgeSourcePort;
  /** Read-only provider-backed public web research used only by Goal planning. */
  readonly webResearchPort?: IAIWebResearchPort;
  /** Canonical runtime observability sink; host-owned and persistence-agnostic. */
  readonly executionRecordPort?: IAIExecutionRecordPort;
  /** Durable indexed usage projection for run/thread queries and workflow views. */
  readonly usageReadPort?: IAIUsageReadPort;
  readonly routineCommandPort: IAIRoutineCommandPort;
  readonly plannerReadPort: IAIPlannerReadPort;
  readonly notificationReadPort: IAINotificationReadPort;
  /** Owner-backed hydration for explicit Goal/Task references selected in the composer. */
  readonly selectedEntityContextReadPort: IAISelectedEntityContextReadPort;
  /** Bounded cross-owner workspace projection used by read-only assistant tools. */
  readonly analyticsReadPort: IAnalyticsReadPort;
  /** Invocation-scoped context projection; resolves canonical Product Time and budgets inputs. */
  readonly contextAssembler: AIContextAssemblerPort;
}

type ActiveRun = {
  readonly identityId: string;
  readonly abort: () => boolean;
  readonly conversationId: string;
  readonly decide: (command: AssistantRuntimeApprovalCommand, context: ExecutionContext) => boolean;
};

/** Mastra is the authoritative AI execution runtime; MemoFlow owns only product/domain truth. */
export class MastraAIRuntime implements AIWorkflowRuntimePort {
  readonly memory: Memory;
  readonly history: AssistantHistoryService;
  readonly assistant: ReturnType<typeof createMemoFlowAssistant>;
  readonly goalPlanner: GoalPlannerWorker;
  readonly goalCreateWorkflow: ReturnType<typeof createGoalCreateWorkflow>;
  readonly taskPlanner: TaskPlannerWorker;
  readonly taskCreateWorkflow: ReturnType<typeof createTaskCreateWorkflow>;
  readonly knowledgeCapturePlanner: KnowledgeCapturePlannerWorker;
  readonly knowledgeCaptureWorkflow: ReturnType<typeof createKnowledgeCaptureWorkflow>;
  readonly controller: AgentController;
  readonly mastra: Mastra;
  private initPromise: Promise<void> | null = null;
  private disposePromise: Promise<void> | null = null;
  private readonly activeRuns = new Map<string, ActiveRun>();
  private readonly selectedContextHydrator: AssistantSelectedContextHydrator;

  constructor(private readonly deps: MastraAIRuntimeDependencies) {
    this.memory = new Memory({
      storage: deps.storage,
      options: { lastMessages: 40 },
    });
    this.history = new AssistantHistoryService(this.memory, deps.conversationShellSource);
    this.selectedContextHydrator = new AssistantSelectedContextHydrator(
      deps.selectedEntityContextReadPort,
      deps.knowledgeSourcePort,
    );
    this.assistant = createMemoFlowAssistant({
      modelResolver: deps.modelResolver,
      memory: this.memory,
    });
    const productTools = createMemoFlowProductTools({
      routineCommandPort: deps.routineCommandPort,
      plannerReadPort: deps.plannerReadPort,
      notificationReadPort: deps.notificationReadPort,
      analyticsReadPort: deps.analyticsReadPort,
      knowledgeSourcePort: deps.knowledgeSourcePort,
    });
    this.goalPlanner = new GoalPlannerWorker(
      deps.modelResolver,
      deps.knowledgeSourcePort,
      deps.executionRecordPort,
      deps.contextAssembler,
      deps.webResearchPort,
    );
    this.goalCreateWorkflow = createGoalCreateWorkflow({
      planner: this.goalPlanner,
      applyService: new ApplyGoalPlanService(deps.goalPlanMutationPort),
    });
    this.taskPlanner = new TaskPlannerWorker(
      deps.modelResolver,
      deps.executionRecordPort,
      deps.contextAssembler,
    );
    this.taskCreateWorkflow = createTaskCreateWorkflow({
      planner: this.taskPlanner,
      applyService: new ApplyTaskPlanService(deps.taskPlanMutationPort),
    });
    this.knowledgeCapturePlanner = new KnowledgeCapturePlannerWorker(
      deps.modelResolver,
      deps.executionRecordPort,
      deps.contextAssembler,
    );
    this.knowledgeCaptureWorkflow = createKnowledgeCaptureWorkflow({
      planner: this.knowledgeCapturePlanner,
      applyService: new ApplyKnowledgeNoteService(deps.knowledgeCaptureMutationPort),
    });
    this.controller = new AgentController({
      id: 'memoflow-assistant-controller',
      toolCategoryResolver: memoFlowToolCategory,
      storage: deps.storage,
      memory: this.memory,
      agent: this.assistant,
      modes: [
        {
          id: 'assistant',
          name: 'Assistant',
          tools: productTools,
          availableTools: Object.keys(productTools),
        },
      ],
      defaultModeId: 'assistant',
      disableBuiltinTools: [
        'ask_user',
        'submit_plan',
        'task_write',
        'task_update',
        'task_complete',
        'task_check',
        'subagent',
      ],
    });
    this.controller.onSessionCreated(applyMemoFlowSessionToolPolicy, { blocking: true });
    this.mastra = new Mastra({
      storage: deps.storage,
      agents: {
        assistant: this.assistant,
        goalPlanner: this.goalPlanner.agent,
        taskPlanner: this.taskPlanner.agent,
        knowledgeCapturePlanner: this.knowledgeCapturePlanner.agent,
      },
      workflows: {
        goalCreate: this.goalCreateWorkflow,
        taskCreate: this.taskCreateWorkflow,
        knowledgeCapture: this.knowledgeCaptureWorkflow,
      },
      agentControllers: { assistant: this.controller },
    });
  }

  async init(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = (async () => {
        await this.deps.storage.init();
        await this.controller.init();
      })();
    }
    await this.initPromise;
  }

  async dispose(): Promise<void> {
    if (!this.disposePromise) {
      this.disposePromise = (async () => {
        for (const run of this.activeRuns.values()) run.abort();
        this.activeRuns.clear();
        await this.memory.settled();
        const close = (this.deps.storage as { close?: () => Promise<void> }).close;
        if (close) await close.call(this.deps.storage);
      })();
    }
    await this.disposePromise;
  }

  private async workflowRequestContext(
    context: ExecutionContext,
    input: {
      conversationId: string;
      locale?: 'zh-CN' | 'en-US';
      providerId?: string;
      modelId?: string;
    },
  ): Promise<RequestContext> {
    const requestContext = new RequestContext();
    requestContext.setRaw('identityId', context.identityId);
    requestContext.setRaw('locale', input.locale ?? 'zh-CN');
    if (input.providerId) requestContext.setRaw('providerId', input.providerId);
    if (input.modelId) requestContext.setRaw('modelId', input.modelId);
    // The current entry context is supplied on every start/resume. Credentials
    // never enter RequestContext; only canonical request metadata used by domain
    // application ports is persisted with the workflow snapshot.
    requestContext.setRaw('executionContext', context);
    requestContext.setRaw(MASTRA_RESOURCE_ID_KEY, context.identityId);
    requestContext.setRaw(MASTRA_THREAD_ID_KEY, input.conversationId);
    return requestContext;
  }

  private parseWorkflowSnapshot(value: unknown): Record<string, unknown> {
    const parsed =
      typeof value === 'string'
        ? (() => {
            try {
              return JSON.parse(value) as unknown;
            } catch {
              throw new Error('AI_WORKFLOW_SNAPSHOT_CORRUPT');
            }
          })()
        : value;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('AI_WORKFLOW_SNAPSHOT_CORRUPT');
    }
    return parsed as Record<string, unknown>;
  }

  private goalCreateInputFromSnapshot(snapshot: Record<string, unknown>) {
    const context = snapshot.context;
    if (!context || typeof context !== 'object' || Array.isArray(context)) {
      throw new Error('AI_WORKFLOW_SNAPSHOT_CORRUPT');
    }
    const parsed = GoalCreateWorkflowInputSchema.safeParse(
      (context as Record<string, unknown>).input,
    );
    if (!parsed.success) throw new Error('AI_WORKFLOW_SNAPSHOT_CORRUPT');
    return parsed.data;
  }

  private projectGoalCreateRun(
    row: {
      runId: string;
      resourceId?: string;
      snapshot: unknown;
      createdAt: Date;
      updatedAt: Date;
    },
    identityId: string,
  ): AIWorkflowRunView | null {
    if (row.resourceId !== identityId) return null;
    const snapshot = this.parseWorkflowSnapshot(row.snapshot);
    const workflowInput = this.goalCreateInputFromSnapshot(snapshot);
    const lowLevelStatus = String(snapshot.status ?? 'running');
    const context = snapshot.context as Record<string, unknown>;
    const lifecycle = context[GOAL_CREATE_LIFECYCLE_STEP_ID];
    const lifecycleRecord =
      lifecycle && typeof lifecycle === 'object' && !Array.isArray(lifecycle)
        ? (lifecycle as Record<string, unknown>)
        : undefined;

    let status: AIWorkflowRunView['status'];
    let suspension: AIWorkflowRunView['suspension'];
    let failure: AIWorkflowRunView['failure'];
    let result: Extract<AIWorkflowRunView, { kind: 'goal.create' }>['result'];

    if (lowLevelStatus === 'suspended') {
      status = 'suspended';
      const parsed = AIWorkflowSuspensionSchema.safeParse(lifecycleRecord?.suspendPayload);
      if (!parsed.success) throw new Error('AI_WORKFLOW_SNAPSHOT_CORRUPT');
      suspension = parsed.data;
      if (suspension.type === 'recovery_required' && suspension.receipt?.kind === 'goal.create') {
        result = suspension.receipt.receipt;
      }
    } else if (lowLevelStatus === 'canceled') {
      status = 'cancelled';
    } else if (lowLevelStatus === 'failed' || lowLevelStatus === 'tripwire') {
      status = 'failed';
      failure = publicRuntimeError(snapshot.error);
    } else if (
      lowLevelStatus === 'success' ||
      lowLevelStatus === 'bailed' ||
      lowLevelStatus === 'skipped'
    ) {
      const parsed = GoalCreateWorkflowOutputSchema.safeParse(snapshot.result);
      if (!parsed.success) throw new Error('AI_WORKFLOW_SNAPSHOT_CORRUPT');
      if (parsed.data.outcome === 'cancelled') {
        status = 'cancelled';
      } else {
        status = 'completed';
        result = parsed.data.receipt;
      }
    } else {
      status = 'running';
    }

    return AIWorkflowRunViewSchema.parse({
      runId: row.runId,
      kind: 'goal.create',
      conversationId: workflowInput.conversationId,
      status,
      ...(suspension ? { suspension } : {}),
      ...(failure ? { failure } : {}),
      ...(result ? { result } : {}),
      createdAt: new Date(row.createdAt).getTime(),
      updatedAt: new Date(row.updatedAt).getTime(),
    });
  }

  private taskCreateInputFromSnapshot(snapshot: Record<string, unknown>) {
    const context = snapshot.context;
    if (!context || typeof context !== 'object' || Array.isArray(context)) {
      throw new Error('AI_WORKFLOW_SNAPSHOT_CORRUPT');
    }
    const parsed = TaskCreateWorkflowInputSchema.safeParse(
      (context as Record<string, unknown>).input,
    );
    if (!parsed.success) throw new Error('AI_WORKFLOW_SNAPSHOT_CORRUPT');
    return parsed.data;
  }

  private projectTaskCreateRun(
    row: {
      runId: string;
      resourceId?: string;
      snapshot: unknown;
      createdAt: Date;
      updatedAt: Date;
    },
    identityId: string,
  ): AIWorkflowRunView | null {
    if (row.resourceId !== identityId) return null;
    const snapshot = this.parseWorkflowSnapshot(row.snapshot);
    const workflowInput = this.taskCreateInputFromSnapshot(snapshot);
    const lowLevelStatus = String(snapshot.status ?? 'running');
    const context = snapshot.context as Record<string, unknown>;
    const lifecycle = context[TASK_CREATE_LIFECYCLE_STEP_ID];
    const lifecycleRecord =
      lifecycle && typeof lifecycle === 'object' && !Array.isArray(lifecycle)
        ? (lifecycle as Record<string, unknown>)
        : undefined;

    let status: AIWorkflowRunView['status'];
    let suspension: AIWorkflowRunView['suspension'];
    let failure: AIWorkflowRunView['failure'];
    let result: Extract<AIWorkflowRunView, { kind: 'task.create' }>['result'];

    if (lowLevelStatus === 'suspended') {
      status = 'suspended';
      const parsed = AIWorkflowSuspensionSchema.safeParse(lifecycleRecord?.suspendPayload);
      if (!parsed.success) throw new Error('AI_WORKFLOW_SNAPSHOT_CORRUPT');
      suspension = parsed.data;
      if (suspension.type === 'recovery_required' && suspension.receipt?.kind === 'task.create') {
        result = suspension.receipt.receipt;
      }
    } else if (lowLevelStatus === 'canceled') {
      status = 'cancelled';
    } else if (lowLevelStatus === 'failed' || lowLevelStatus === 'tripwire') {
      status = 'failed';
      failure = publicRuntimeError(snapshot.error);
    } else if (
      lowLevelStatus === 'success' ||
      lowLevelStatus === 'bailed' ||
      lowLevelStatus === 'skipped'
    ) {
      const parsed = TaskCreateWorkflowOutputSchema.safeParse(snapshot.result);
      if (!parsed.success) throw new Error('AI_WORKFLOW_SNAPSHOT_CORRUPT');
      if (parsed.data.outcome === 'cancelled') {
        status = 'cancelled';
      } else {
        status = 'completed';
        result = parsed.data.receipt;
      }
    } else {
      status = 'running';
    }

    return AIWorkflowRunViewSchema.parse({
      runId: row.runId,
      kind: 'task.create',
      conversationId: workflowInput.conversationId,
      status,
      ...(suspension ? { suspension } : {}),
      ...(failure ? { failure } : {}),
      ...(result ? { result } : {}),
      createdAt: new Date(row.createdAt).getTime(),
      updatedAt: new Date(row.updatedAt).getTime(),
    });
  }

  private knowledgeCaptureInputFromSnapshot(snapshot: Record<string, unknown>) {
    const context = snapshot.context;
    if (!context || typeof context !== 'object' || Array.isArray(context)) {
      throw new Error('AI_WORKFLOW_SNAPSHOT_CORRUPT');
    }
    const parsed = KnowledgeCaptureWorkflowInputSchema.safeParse(
      (context as Record<string, unknown>).input,
    );
    if (!parsed.success) throw new Error('AI_WORKFLOW_SNAPSHOT_CORRUPT');
    return parsed.data;
  }

  private projectKnowledgeCaptureRun(
    row: {
      runId: string;
      resourceId?: string;
      snapshot: unknown;
      createdAt: Date;
      updatedAt: Date;
    },
    identityId: string,
  ): AIWorkflowRunView | null {
    if (row.resourceId !== identityId) return null;
    const snapshot = this.parseWorkflowSnapshot(row.snapshot);
    const workflowInput = this.knowledgeCaptureInputFromSnapshot(snapshot);
    const lowLevelStatus = String(snapshot.status ?? 'running');
    const context = snapshot.context as Record<string, unknown>;
    const lifecycle = context[KNOWLEDGE_CAPTURE_LIFECYCLE_STEP_ID];
    const lifecycleRecord =
      lifecycle && typeof lifecycle === 'object' && !Array.isArray(lifecycle)
        ? (lifecycle as Record<string, unknown>)
        : undefined;

    let status: AIWorkflowRunView['status'];
    let suspension: AIWorkflowRunView['suspension'];
    let failure: AIWorkflowRunView['failure'];
    let result: Extract<AIWorkflowRunView, { kind: 'knowledge.capture' }>['result'];

    if (lowLevelStatus === 'suspended') {
      status = 'suspended';
      const parsed = AIWorkflowSuspensionSchema.safeParse(lifecycleRecord?.suspendPayload);
      if (!parsed.success) throw new Error('AI_WORKFLOW_SNAPSHOT_CORRUPT');
      suspension = parsed.data;
      if (
        suspension.type === 'recovery_required' &&
        suspension.receipt?.kind === 'knowledge.capture'
      ) {
        result = suspension.receipt.receipt;
      }
    } else if (lowLevelStatus === 'canceled') {
      status = 'cancelled';
    } else if (lowLevelStatus === 'failed' || lowLevelStatus === 'tripwire') {
      status = 'failed';
      failure = publicRuntimeError(snapshot.error);
    } else if (
      lowLevelStatus === 'success' ||
      lowLevelStatus === 'bailed' ||
      lowLevelStatus === 'skipped'
    ) {
      const parsed = KnowledgeCaptureWorkflowOutputSchema.safeParse(snapshot.result);
      if (!parsed.success) throw new Error('AI_WORKFLOW_SNAPSHOT_CORRUPT');
      if (parsed.data.outcome === 'cancelled') {
        status = 'cancelled';
      } else {
        status = 'completed';
        result = parsed.data.receipt;
      }
    } else {
      status = 'running';
    }

    return AIWorkflowRunViewSchema.parse({
      runId: row.runId,
      kind: 'knowledge.capture',
      conversationId: workflowInput.conversationId,
      status,
      ...(suspension ? { suspension } : {}),
      ...(failure ? { failure } : {}),
      ...(result ? { result } : {}),
      createdAt: new Date(row.createdAt).getTime(),
      updatedAt: new Date(row.updatedAt).getTime(),
    });
  }

  private async workflowStore() {
    const store = await this.deps.storage.getStore('workflows');
    if (!store) throw new Error('AI_WORKFLOW_STORAGE_UNAVAILABLE');
    return store;
  }

  async start(input: {
    context: ExecutionContext;
    request: AIWorkflowStartClientRequest;
  }): Promise<AIWorkflowRunView> {
    await this.init();
    // Capture the raw runtime kind as a plain string before any control-flow
    // narrowing so the unsupported-kind guard can report it faithfully even
    // when the closed client union types the branch as `never`.
    const requestedKind: string = input.request.kind as string;
    if (
      requestedKind !== 'goal.create' &&
      requestedKind !== 'task.create' &&
      requestedKind !== 'knowledge.capture'
    ) {
      throw new Error(`AI_WORKFLOW_KIND_UNSUPPORTED:${requestedKind}`);
    }
    const workflowInput = this.workflowInputFromRequest(input);
    if (input.request.kind === 'goal.create') {
      const goalInput = GoalCreateWorkflowInputSchema.parse(workflowInput);
      const workflowTurn = input.request.workflowTurn;
      if (workflowTurn)
        await this.history.appendUserTurn({
          ...input.request,
          ...input.context,
          content: workflowTurn,
        });
      const run = await this.goalCreateWorkflow.createRun({
        resourceId: input.context.identityId,
      });
      try {
        await run.start({
          inputData: goalInput,
          initialState: initialGoalCreateWorkflowState(goalInput),
          requestContext: await this.workflowRequestContext(input.context, goalInput),
        });
      } catch (cause) {
        const persisted = await this.get({
          identityId: input.context.identityId,
          runId: run.runId,
        });
        if (persisted) return persisted;
        throw cause;
      }
      const persisted = await this.get({ identityId: input.context.identityId, runId: run.runId });
      if (!persisted) throw new Error('AI_WORKFLOW_SNAPSHOT_MISSING');
      return persisted;
    }
    if (input.request.kind === 'task.create') {
      const taskInput = TaskCreateWorkflowInputSchema.parse(workflowInput);
      const run = await this.taskCreateWorkflow.createRun({
        resourceId: input.context.identityId,
      });
      try {
        await run.start({
          inputData: taskInput,
          initialState: initialTaskCreateWorkflowState(taskInput),
          requestContext: await this.workflowRequestContext(input.context, taskInput),
        });
      } catch (cause) {
        const persisted = await this.get({
          identityId: input.context.identityId,
          runId: run.runId,
        });
        if (persisted) return persisted;
        throw cause;
      }
      const persisted = await this.get({ identityId: input.context.identityId, runId: run.runId });
      if (!persisted) throw new Error('AI_WORKFLOW_SNAPSHOT_MISSING');
      return persisted;
    }
    const knowledgeInput = KnowledgeCaptureWorkflowInputSchema.parse(workflowInput);
    const run = await this.knowledgeCaptureWorkflow.createRun({
      resourceId: input.context.identityId,
    });
    try {
      await run.start({
        inputData: knowledgeInput,
        initialState: initialKnowledgeCaptureWorkflowState(knowledgeInput),
        requestContext: await this.workflowRequestContext(input.context, knowledgeInput),
      });
    } catch (cause) {
      const persisted = await this.get({
        identityId: input.context.identityId,
        runId: run.runId,
      });
      if (persisted) return persisted;
      throw cause;
    }
    const persisted = await this.get({ identityId: input.context.identityId, runId: run.runId });
    if (!persisted) throw new Error('AI_WORKFLOW_SNAPSHOT_MISSING');
    return persisted;
  }

  private workflowInputFromRequest(input: {
    context: ExecutionContext;
    request: AIWorkflowStartClientRequest;
  }) {
    const base = {
      ...input.request.input,
      identityId: input.context.identityId,
      conversationId: input.request.conversationId,
      locale: input.request.locale ?? 'zh-CN',
      providerId: input.request.providerId,
      modelId: input.request.modelId,
    };
    return base;
  }

  async resume(input: {
    context: ExecutionContext;
    request: AIWorkflowResumeClientRequest;
  }): Promise<AIWorkflowRunView> {
    await this.init();
    const before = await this.get({
      identityId: input.context.identityId,
      runId: input.request.runId,
    });
    if (!before) throw new Error('AI_WORKFLOW_RUN_NOT_FOUND');
    // Terminal projection is authoritative. This makes repeated/double approve
    // a read-only replay even before deterministic domain IDs provide the
    // second line of defense against concurrent resumes.
    if (
      before.status === 'completed' ||
      before.status === 'failed' ||
      before.status === 'cancelled'
    ) {
      return before;
    }
    if (
      before.kind !== 'goal.create' &&
      before.kind !== 'task.create' &&
      before.kind !== 'knowledge.capture'
    ) {
      throw new Error('AI_WORKFLOW_KIND_UNSUPPORTED');
    }
    if (input.request.command.type === 'answer' && input.request.workflowTurn) {
      await this.history.appendUserTurn({
        identityId: input.context.identityId,
        conversationId: before.conversationId,
        content: input.request.workflowTurn,
      });
    }

    const store = await this.workflowStore();
    const workflowName =
      before.kind === 'goal.create'
        ? GOAL_CREATE_WORKFLOW_ID
        : before.kind === 'task.create'
          ? TASK_CREATE_WORKFLOW_ID
          : KNOWLEDGE_CAPTURE_WORKFLOW_ID;
    const row = await store.getWorkflowRunById({
      workflowName,
      runId: input.request.runId,
    });
    if (!row || row.resourceId !== input.context.identityId) {
      throw new Error('AI_WORKFLOW_RUN_NOT_FOUND');
    }
    const workflowInput = this.workflowInputFromSnapshot(workflowName, row.snapshot);
    const workflow =
      before.kind === 'goal.create'
        ? this.goalCreateWorkflow
        : before.kind === 'task.create'
          ? this.taskCreateWorkflow
          : this.knowledgeCaptureWorkflow;
    const lifecycleStepId =
      before.kind === 'goal.create'
        ? GOAL_CREATE_LIFECYCLE_STEP_ID
        : before.kind === 'task.create'
          ? TASK_CREATE_LIFECYCLE_STEP_ID
          : KNOWLEDGE_CAPTURE_LIFECYCLE_STEP_ID;
    const run = await workflow.createRun({
      runId: input.request.runId,
      resourceId: input.context.identityId,
    });
    try {
      await run.resume({
        step: lifecycleStepId,
        resumeData: input.request.command,
        requestContext: await this.workflowRequestContext(input.context, workflowInput),
      });
    } catch (cause) {
      const persisted = await this.get({
        identityId: input.context.identityId,
        runId: input.request.runId,
      });
      if (persisted && persisted.status !== 'running') return persisted;
      throw cause;
    }
    const persisted = await this.get({
      identityId: input.context.identityId,
      runId: input.request.runId,
    });
    if (!persisted) throw new Error('AI_WORKFLOW_SNAPSHOT_MISSING');
    return persisted;
  }

  async summarizeUsage(input: {
    identityId: string;
    conversationId?: string;
    runId?: string;
  }): Promise<AIUsageSummary> {
    if (!this.deps.usageReadPort) {
      return {
        executionCount: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      };
    }
    return this.deps.usageReadPort.summarizeUsage(input);
  }

  private async attachWorkflowUsage(
    view: AIWorkflowRunView | null,
    identityId: string,
  ): Promise<AIWorkflowRunView | null> {
    if (!view || !this.deps.usageReadPort) return view;
    const summary = await this.deps.usageReadPort.summarizeUsage({
      identityId,
      runId: view.runId,
    });
    if (summary.executionCount === 0) return view;
    return {
      ...view,
      usage: {
        promptTokens: summary.promptTokens,
        completionTokens: summary.completionTokens,
        totalTokens: summary.totalTokens,
        ...(summary.estimatedCost !== undefined ? { estimatedCost: summary.estimatedCost } : {}),
      },
    };
  }

  private workflowInputFromSnapshot(
    workflowName: string,
    rawSnapshot: unknown,
  ):
    | ReturnType<(typeof GoalCreateWorkflowInputSchema)['parse']>
    | ReturnType<(typeof TaskCreateWorkflowInputSchema)['parse']>
    | ReturnType<(typeof KnowledgeCaptureWorkflowInputSchema)['parse']> {
    const snapshot = this.parseWorkflowSnapshot(rawSnapshot);
    if (workflowName === GOAL_CREATE_WORKFLOW_ID) {
      return this.goalCreateInputFromSnapshot(snapshot);
    }
    if (workflowName === TASK_CREATE_WORKFLOW_ID) {
      return this.taskCreateInputFromSnapshot(snapshot);
    }
    if (workflowName === KNOWLEDGE_CAPTURE_WORKFLOW_ID) {
      return this.knowledgeCaptureInputFromSnapshot(snapshot);
    }
    throw new Error('AI_WORKFLOW_KIND_UNSUPPORTED');
  }

  async get(input: { identityId: string; runId: string }): Promise<AIWorkflowRunView | null> {
    await this.init();
    const store = await this.workflowStore();
    const goalRow = await store.getWorkflowRunById({
      workflowName: GOAL_CREATE_WORKFLOW_ID,
      runId: input.runId,
    });
    if (goalRow) {
      return this.attachWorkflowUsage(
        this.projectGoalCreateRun(goalRow, input.identityId),
        input.identityId,
      );
    }
    const taskRow = await store.getWorkflowRunById({
      workflowName: TASK_CREATE_WORKFLOW_ID,
      runId: input.runId,
    });
    if (taskRow) {
      return this.attachWorkflowUsage(
        this.projectTaskCreateRun(taskRow, input.identityId),
        input.identityId,
      );
    }
    const knowledgeRow = await store.getWorkflowRunById({
      workflowName: KNOWLEDGE_CAPTURE_WORKFLOW_ID,
      runId: input.runId,
    });
    if (knowledgeRow) {
      return this.attachWorkflowUsage(
        this.projectKnowledgeCaptureRun(knowledgeRow, input.identityId),
        input.identityId,
      );
    }
    return null;
  }

  async list(input: {
    identityId: string;
    conversationId?: string;
  }): Promise<readonly AIWorkflowRunView[]> {
    await this.init();
    const store = await this.workflowStore();
    const goalRows = await store.listWorkflowRuns({
      workflowName: GOAL_CREATE_WORKFLOW_ID,
      resourceId: input.identityId,
      perPage: false,
    });
    const taskRows = await store.listWorkflowRuns({
      workflowName: TASK_CREATE_WORKFLOW_ID,
      resourceId: input.identityId,
      perPage: false,
    });
    const knowledgeRows = await store.listWorkflowRuns({
      workflowName: KNOWLEDGE_CAPTURE_WORKFLOW_ID,
      resourceId: input.identityId,
      perPage: false,
    });
    const views = [
      ...goalRows.runs.map((row) => this.projectGoalCreateRun(row, input.identityId)),
      ...taskRows.runs.map((row) => this.projectTaskCreateRun(row, input.identityId)),
      ...knowledgeRows.runs.map((row) => this.projectKnowledgeCaptureRun(row, input.identityId)),
    ]
      .filter((view): view is AIWorkflowRunView => view !== null)
      .filter((view) => !input.conversationId || view.conversationId === input.conversationId);
    const enriched = await Promise.all(
      views.map((view) => this.attachWorkflowUsage(view, input.identityId)),
    );
    return enriched
      .filter((view): view is AIWorkflowRunView => view !== null)
      .sort((left, right) => right.updatedAt - left.updatedAt);
  }

  async cancel(input: { identityId: string; runId: string }): Promise<AIWorkflowRunView | null> {
    await this.init();
    const before = await this.get(input);
    if (!before) return null;
    if (
      before.status === 'completed' ||
      before.status === 'failed' ||
      before.status === 'cancelled'
    ) {
      return before;
    }
    const workflow =
      before.kind === 'goal.create'
        ? this.goalCreateWorkflow
        : before.kind === 'task.create'
          ? this.taskCreateWorkflow
          : this.knowledgeCaptureWorkflow;
    const run = await workflow.createRun({
      runId: input.runId,
      resourceId: input.identityId,
    });
    await run.cancel();
    return this.get(input);
  }

  async listMessages(input: {
    identityId: string;
    conversationId: string;
  }): Promise<AssistantRuntimeHistoryView> {
    await this.init();
    return this.history.listMessages(input);
  }

  async deleteConversation(input: {
    identityId: string;
    conversationId: string;
  }): Promise<boolean> {
    await this.init();
    return this.history.deleteConversation(input);
  }

  /**
   * Cancel only a run owned by the authenticated identity. A guessed runId can
   * never become an authorization primitive.
   */
  cancelRun(input: { identityId: string; runId: string }): boolean {
    const active = this.activeRuns.get(input.runId);
    if (!active || active.identityId !== input.identityId) return false;
    return active.abort();
  }

  decideToolApproval(input: {
    context: ExecutionContext;
    command: AssistantRuntimeApprovalCommand;
  }): boolean {
    const active = this.activeRuns.get(input.command.runId);
    if (
      !active ||
      active.identityId !== input.context.identityId ||
      active.conversationId !== input.command.conversationId
    )
      return false;
    return active.decide(input.command, input.context);
  }

  async *dispatchMessage(input: {
    identityId: string;
    /** Host request context carries requestId/traceId; credentials never enter it. */
    context?: ExecutionContext;
    conversationId: string;
    content: string;
    providerId?: string;
    modelId?: string;
    locale?: 'zh-CN' | 'en-US';
    attachments?: readonly AssistantRuntimeAttachment[];
    selectedEntities?: readonly AssistantRuntimeSelectedEntity[];
    signal?: AbortSignal;
  }): AsyncGenerator<AssistantRuntimeEvent, void, void> {
    await this.init();
    await this.history.ensureConversation({
      identityId: input.identityId,
      conversationId: input.conversationId,
    });
    if (input.context && input.context.identityId !== input.identityId) {
      throw new Error('Mastra Assistant execution context identity mismatch');
    }
    const startedAt = Date.now();
    const resolvedModel = await this.deps.modelResolver.resolve({
      identityId: input.identityId,
      providerId: input.providerId,
      modelId: input.modelId,
      executionRequirement: {
        chat: 'required',
        streaming: 'required',
        toolCalling: 'required',
        ...(input.attachments?.some((attachment) => attachment.mediaType.startsWith('image/'))
          ? { vision: 'required' as const }
          : {}),
      },
    });
    const requestContext = new RequestContext();
    requestContext.setRaw('identityId', input.identityId);
    requestContext.setRaw('providerId', resolvedModel.providerId);
    requestContext.setRaw('modelId', resolvedModel.modelId);
    requestContext.setRaw('locale', input.locale ?? 'zh-CN');
    if (input.context) requestContext.setRaw('executionContext', input.context);
    requestContext.setRaw(MASTRA_RESOURCE_ID_KEY, input.identityId);
    requestContext.setRaw(MASTRA_THREAD_ID_KEY, input.conversationId);

    const selectedEntities = input.selectedEntities ?? [];
    const selectedContext = await this.selectedContextHydrator.hydrate(
      input.identityId,
      selectedEntities,
    );

    const contextEnvelope = await this.deps.contextAssembler.assemble({
      invocation: {
        identityId: input.identityId,
        conversationId: input.conversationId,
        surface: 'assistant',
        locale: input.locale ?? 'zh-CN',
      },
      userInput: {
        content: input.content,
        attachments: input.attachments?.map((attachment) => ({
          mediaType: attachment.mediaType,
          filename: attachment.filename,
        })),
        selectedEntities: input.selectedEntities?.map((entity) => ({
          entityType: entity.entityType,
          id: entity.id,
          label: entity.label,
        })),
      },
      domainFacts: selectedContext.domainFacts,
      knowledgeEvidence: selectedContext.knowledgeEvidence,
      selectedEntities: [
        {
          entityType: 'conversation',
          id: input.conversationId,
          source: 'assistant.session',
        },
        ...(input.selectedEntities ?? []).map((entity) => ({
          entityType: entity.entityType,
          id: entity.id,
          source: 'assistant.user-selection',
        })),
      ],
    });
    setAIContextRequestContext(requestContext, contextEnvelope);

    const session = await this.controller.createSession({
      id: `conversation:${input.conversationId}`,
      ownerId: input.identityId,
      resourceId: input.identityId,
      threadId: input.conversationId,
      requestContext,
    });
    const conversationBusy = () =>
      [...this.activeRuns.values()].some(
        (active) => active.conversationId === input.conversationId,
      );
    if (conversationBusy() || session.run.isRunning())
      throw new Error('Assistant conversation already has an active turn');
    // Reapply on cached/reconnected sessions; setup failure must prevent the turn.
    await applyMemoFlowSessionToolPolicy(session);
    if (conversationBusy() || session.run.isRunning())
      throw new Error('Assistant conversation already has an active turn');
    const queue = new AsyncEventQueue<AssistantRuntimeEvent>();
    const fallbackRunId = `turn:${input.conversationId}:${randomUUID()}`;
    let runId = '';
    let sequence = 0;
    let lastText = '';
    let assistantMessageId: string | undefined;
    let lastRuntimeError: { code: string; message: string } | undefined;
    let lastUsage: AssistantUsageSnapshot | undefined;
    const observabilityWrites: Promise<void>[] = [];
    let firstActivityAt: number | undefined;
    let firstTokenAt: number | undefined;
    let transportRecorded = false;
    let providerSegmentStartedAt: number | undefined;
    const toolStartedAt = new Map<string, number>();
    const approvalStartedAt = new Map<string, number>();
    let settled = false;
    let stopping = false;
    const bindingGeneration = session.run.bindingGeneration();
    let nativeRunId: string | null = null;
    const tools = new Map<
      string,
      Extract<AssistantRuntimeEvent, { type: 'assistant.approval.required' }>['data']
    >();
    const pending = new Set<string>();
    const ownsTurn = () =>
      !settled &&
      session.run.bindingGeneration() === bindingGeneration &&
      session.thread.getId() === input.conversationId &&
      session.identity.getOwnerId() === input.identityId &&
      session.identity.getResourceId() === input.identityId &&
      this.activeRuns.get(runId || fallbackRunId)?.decide === decide;
    const ownsNativeRun = () => ownsTurn() && session.getCurrentRunId() === nativeRunId;

    const currentRunId = (): string => runId || fallbackRunId;

    const recordPhase = (
      phase: Parameters<typeof createAssistantPhaseExecutionRecord>[0]['phase'],
      processingMs: number,
      outcome: 'succeeded' | 'failed' | 'cancelled' = 'succeeded',
      errorCategory?: string,
    ): void => {
      if (!this.deps.executionRecordPort) return;
      observabilityWrites.push(
        this.deps.executionRecordPort.record(
          createAssistantPhaseExecutionRecord({
            identityId: input.identityId,
            conversationId: input.conversationId,
            model: resolvedModel,
            runId: currentRunId(),
            phase,
            processingMs,
            outcome,
            ...(input.context ? { context: input.context } : {}),
            ...(errorCategory ? { errorCategory } : {}),
          }),
        ),
      );
    };

    const finishProviderSegment = (
      now = Date.now(),
      outcome: 'succeeded' | 'failed' | 'cancelled' = 'succeeded',
      errorCategory?: string,
    ): void => {
      if (providerSegmentStartedAt === undefined) return;
      recordPhase('provider_inference', now - providerSegmentStartedAt, outcome, errorCategory);
      providerSegmentStartedAt = undefined;
    };

    const recordFirstActivity = (now: number): void => {
      if (firstActivityAt !== undefined) return;
      firstActivityAt = now;
      recordPhase('first_activity', now - startedAt);
    };

    const recordTransport = (
      now: number,
      outcome: 'succeeded' | 'failed' | 'cancelled' = 'succeeded',
      errorCategory?: string,
    ): void => {
      if (transportRecorded) return;
      transportRecorded = true;
      recordPhase('transport', now - startedAt, outcome, errorCategory);
    };

    const recordFirstToken = (now = Date.now()): void => {
      finishProviderSegment(now);
      if (firstTokenAt !== undefined) return;
      firstTokenAt = now;
      recordPhase('first_token', now - startedAt);
    };

    const emit = <T extends AssistantRuntimeEvent['type']>(
      type: T,
      data: Extract<AssistantRuntimeEvent, { type: T }>['data'],
    ): void => {
      const id = currentRunId();
      sequence += 1;
      queue.push({
        eventId: `${id}:${sequence}`,
        runId: id,
        conversationId: input.conversationId,
        sequence,
        createdAt: Date.now(),
        type,
        data,
      } as Extract<AssistantRuntimeEvent, { type: T }>);
    };

    const settle = (
      type: 'assistant.run.completed' | 'assistant.run.failed' | 'assistant.run.cancelled',
    ): void => {
      if (settled) return;
      const now = Date.now();
      const phaseOutcome =
        type === 'assistant.run.completed'
          ? ('succeeded' as const)
          : type === 'assistant.run.cancelled'
            ? ('cancelled' as const)
            : ('failed' as const);
      const phaseErrorCategory =
        type === 'assistant.run.cancelled' ? 'aborted' : lastRuntimeError?.code;
      recordTransport(now, phaseOutcome, phaseErrorCategory);
      finishProviderSegment(now, phaseOutcome, phaseErrorCategory);
      for (const [toolCallId, phaseStartedAt] of toolStartedAt) {
        recordPhase(
          'tool',
          now - phaseStartedAt,
          type === 'assistant.run.completed' ? 'failed' : phaseOutcome,
          type === 'assistant.run.completed' ? 'tool_phase_incomplete' : phaseErrorCategory,
        );
        toolStartedAt.delete(toolCallId);
      }
      for (const [toolCallId, phaseStartedAt] of approvalStartedAt) {
        recordPhase(
          'approval_wait',
          now - phaseStartedAt,
          type === 'assistant.run.completed' ? 'failed' : phaseOutcome,
          type === 'assistant.run.completed' ? 'approval_phase_incomplete' : phaseErrorCategory,
        );
        approvalStartedAt.delete(toolCallId);
      }
      for (const toolCallId of pending) {
        emit('assistant.approval.resolved', {
          toolCallId,
          resolution: type === 'assistant.run.cancelled' ? 'cancelled' : 'failed',
        });
      }
      pending.clear();
      settled = true;
      if (type === 'assistant.run.completed') {
        emit(type, {
          content: lastText,
          ...(assistantMessageId ? { assistantMessageId } : {}),
        });
      } else if (type === 'assistant.run.failed') {
        emit(type, lastRuntimeError ?? publicRuntimeError());
      } else {
        emit(type, { reason: 'aborted' });
      }

      if (this.deps.executionRecordPort) {
        observabilityWrites.push(
          this.deps.executionRecordPort.record(
            createAssistantExecutionRecord({
              identityId: input.identityId,
              ...(input.context ? { context: input.context } : {}),
              conversationId: input.conversationId,
              model: resolvedModel,
              runId: currentRunId(),
              outcome: type,
              ...(lastUsage ? { usage: lastUsage } : {}),
              ...(lastRuntimeError?.code ? { runtimeErrorCode: lastRuntimeError.code } : {}),
              processingMs: now - startedAt,
            }),
          ),
        );
      }
      if (this.activeRuns.get(currentRunId())?.decide === decide)
        this.activeRuns.delete(currentRunId());
      queue.end();
    };

    const abort = (): boolean => {
      if (!ownsTurn() || stopping || (runId && !ownsNativeRun())) return false;
      stopping = true;
      for (const toolCallId of pending)
        emit('assistant.approval.resolved', { toolCallId, resolution: 'cancelled' });
      pending.clear();
      // Native startup can clear an earlier abort and assign its id before agent_start.
      // Keep the reservation and replay Stop only once that run is bound.
      if (!runId) nativeRunId = session.getCurrentRunId();
      else session.abortRun();
      return true;
    };
    const onAbort = (): void => {
      if (!abort() && !stopping) settle('assistant.run.cancelled');
    };
    const decide = (
      command: AssistantRuntimeApprovalCommand,
      context: ExecutionContext,
    ): boolean => {
      if (
        !ownsNativeRun() ||
        stopping ||
        session.run.isAbortRequested() ||
        !pending.has(command.toolCallId) ||
        !session.approval.isArmed() ||
        session.approval.getToolCallId() !== command.toolCallId
      )
        return false;
      pending.delete(command.toolCallId);
      const decisionContext = new RequestContext(requestContext.entries());
      decisionContext.setRaw('identityId', input.identityId);
      decisionContext.setRaw('executionContext', context);
      decisionContext.setRaw(MASTRA_RESOURCE_ID_KEY, input.identityId);
      decisionContext.setRaw(MASTRA_THREAD_ID_KEY, input.conversationId);
      session.respondToToolApproval({
        decision: command.decision,
        toolCallId: command.toolCallId,
        requestContext: decisionContext,
      });
      if (session.approval.isArmed()) {
        pending.add(command.toolCallId);
        return false;
      }
      const approvalStarted = approvalStartedAt.get(command.toolCallId);
      if (approvalStarted !== undefined) {
        const now = Date.now();
        recordPhase(
          'approval_wait',
          now - approvalStarted,
          command.decision === 'approve' ? 'succeeded' : 'cancelled',
          command.decision === 'approve' ? undefined : 'approval_declined',
        );
        approvalStartedAt.delete(command.toolCallId);
      }
      emit('assistant.approval.resolved', {
        toolCallId: command.toolCallId,
        resolution: command.decision === 'approve' ? 'approved' : 'declined',
      });
      return true;
    };
    const activeRun: ActiveRun = {
      identityId: input.identityId,
      conversationId: input.conversationId,
      abort,
      decide,
    };
    // Reserve synchronously before sendMessage; never let native queued follow-ups become product turns.
    this.activeRuns.set(fallbackRunId, activeRun);
    const unsubscribe = session.subscribe((event) => {
      if (settled) return;
      if (!ownsTurn()) {
        settle(stopping ? 'assistant.run.cancelled' : 'assistant.run.failed');
        return;
      }
      if ('threadId' in event && event.threadId && event.threadId !== input.conversationId) return;
      if (event.type === 'agent_start') {
        const nextNativeRunId = session.getCurrentRunId();
        // A native resume belongs to this turn only while it retains the native run id.
        if (runId || nativeRunId) {
          if (nextNativeRunId !== nativeRunId) {
            settle(stopping ? 'assistant.run.cancelled' : 'assistant.run.failed');
            return;
          }
          if (runId) return;
        }
        nativeRunId = nextNativeRunId;
        runId = nextNativeRunId ?? fallbackRunId;
        this.activeRuns.delete(fallbackRunId);
        this.activeRuns.set(runId, activeRun);
        const now = Date.now();
        recordTransport(now);
        recordFirstActivity(now);
        providerSegmentStartedAt = now;
        emit('assistant.run.started', {
          modelId: resolvedModel.modelId,
          providerId: resolvedModel.providerId,
        });
        if (stopping) session.abortRun();
        return;
      }
      if (!ownsNativeRun()) return;
      if (stopping) {
        if (event.type === 'agent_end') settle('assistant.run.cancelled');
        return;
      }
      if (event.type === 'tool_start' || event.type === 'tool_approval_required') {
        const name = AssistantToolNameSchema.safeParse(event.toolName);
        const policy = memoFlowToolPolicy(event.toolName);
        if (!name.success || !policy || event.toolCallId.length > 512 || !event.toolCallId) {
          abort();
          return;
        }
        const category = policy.category;
        if (category !== 'read' && category !== 'edit' && category !== 'execute') return;
        const now = Date.now();
        recordFirstActivity(now);
        finishProviderSegment(now);
        const tool = {
          toolCallId: event.toolCallId,
          toolName: name.data,
          category,
          risk: policy.requireApproval ? ('high' as const) : ('low' as const),
        };
        tools.set(event.toolCallId, tool);
        if (event.type === 'tool_approval_required') {
          if (!policy.requireApproval || stopping) {
            abort();
            return;
          }
          if (!approvalStartedAt.has(event.toolCallId))
            approvalStartedAt.set(event.toolCallId, now);
          pending.add(event.toolCallId);
          emit('assistant.approval.required', tool);
        } else {
          const approvalStarted = approvalStartedAt.get(event.toolCallId);
          if (approvalStarted !== undefined) {
            recordPhase('approval_wait', now - approvalStarted);
            approvalStartedAt.delete(event.toolCallId);
          }
          if (!toolStartedAt.has(event.toolCallId)) toolStartedAt.set(event.toolCallId, now);
          emit('assistant.activity', { activityType: 'tool', ...tool, state: 'running' });
        }
        return;
      }
      if (event.type === 'tool_end') {
        const now = Date.now();
        const toolStarted = toolStartedAt.get(event.toolCallId);
        if (toolStarted !== undefined) {
          recordPhase(
            'tool',
            now - toolStarted,
            event.isError ? 'failed' : event.denied ? 'cancelled' : 'succeeded',
            event.isError ? 'tool_failed' : event.denied ? 'tool_denied' : undefined,
          );
          toolStartedAt.delete(event.toolCallId);
        }
        const tool = tools.get(event.toolCallId);
        if (tool)
          emit('assistant.activity', {
            activityType: 'tool',
            ...tool,
            state: event.denied ? 'denied' : event.isError ? 'failed' : 'completed',
          });
        tools.delete(event.toolCallId);
        providerSegmentStartedAt = now;
        return;
      }
      if (event.type === 'message_start' && event.message.role === 'assistant') {
        assistantMessageId = event.message.id;
        lastText = messageText(event);
        if (lastText) {
          recordFirstToken();
          emit('assistant.message.delta', { content: lastText });
        }
        return;
      }
      if (event.type === 'message_update' && event.id === assistantMessageId) {
        if (event.event.type === 'text-delta') {
          recordFirstToken();
          lastText += event.event.delta;
          emit('assistant.message.delta', { content: event.event.delta });
        }
        return;
      }
      if (event.type === 'usage_update') {
        lastUsage = {
          promptTokens: event.usage.promptTokens,
          completionTokens: event.usage.completionTokens,
          totalTokens: event.usage.totalTokens,
        };
        emit('assistant.usage.updated', projectAssistantUsage(resolvedModel.modelId, lastUsage));
        return;
      }
      if (event.type === 'error') {
        lastRuntimeError = publicRuntimeError(event.error);
        return;
      }
      if (event.type === 'agent_end') {
        if (event.reason === 'aborted') settle('assistant.run.cancelled');
        else if (event.reason === 'error') settle('assistant.run.failed');
        else if (event.reason === 'suspended' || pending.size) {
          abort();
          settle('assistant.run.failed');
        } else settle('assistant.run.completed');
      }
    });

    input.signal?.addEventListener('abort', onAbort, { once: true });
    if (input.signal?.aborted) {
      stopping = true;
      settle('assistant.run.cancelled');
    }
    const sending = settled
      ? Promise.resolve()
      : session
          .sendMessage({
            content: input.content,
            files: input.attachments?.map((attachment) => ({
              data: attachment.data,
              mediaType: attachment.mediaType,
              ...(attachment.filename ? { filename: attachment.filename } : {}),
            })),
            requestContext,
          })
          .then(() => {
            // Startup may end without agent_start/agent_end (for example a rejected delivery).
            if (stopping) settle('assistant.run.cancelled');
          })
          .catch((error) => {
            if (settled) return;
            const wasStopping = stopping;
            if (pending.size) abort();
            lastRuntimeError = publicRuntimeError(error);
            settle(wasStopping ? 'assistant.run.cancelled' : 'assistant.run.failed');
          });

    try {
      while (true) {
        const next = await queue.next();
        if (next.done) break;
        yield next.value;
      }
    } finally {
      input.signal?.removeEventListener('abort', onAbort);
      if (!settled) {
        abort();
        await sending;
      }
      unsubscribe();
      if (this.activeRuns.get(currentRunId()) === activeRun) this.activeRuns.delete(currentRunId());
      if (observabilityWrites.length > 0) {
        await Promise.allSettled(observabilityWrites);
      }
    }
  }
}
