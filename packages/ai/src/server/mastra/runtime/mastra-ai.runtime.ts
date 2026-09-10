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
  AIWorkflowRunViewSchema,
  AIWorkflowSuspensionSchema,
  GoalCreateWorkflowInputSchema,
  KnowledgeCaptureWorkflowInputSchema,
  TaskCreateWorkflowInputSchema,
  type AIWorkflowResumeClientRequest,
  type AIWorkflowRunView,
  type AIWorkflowStartClientRequest,
  type AssistantRuntimeEvent,
  type AssistantRuntimeHistoryView,
} from '@memoflow/contracts/ai';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import type { UserTimeContextPort } from '@memoflow/time';
import type {
  AIUsageSummary,
  IAIExecutionLogPort,
  IAIUsageReadPort,
  IAIRoutineCommandPort,
  IAIPlannerReadPort,
  IAINotificationReadPort,
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
  createAssistantExecutionLog,
  projectAssistantUsage,
  type AssistantUsageSnapshot,
} from './assistant-observability';
import { AssistantHistoryService } from './assistant-history.service';
import type { AssistantTranscriptBootstrapSource } from './assistant-transcript-bootstrap.port';
import type { AIWorkflowRuntimePort } from './workflow-runtime.port';

function messageText(
  event: Extract<AgentControllerEvent, { type: 'message_update' | 'message_end' }>,
): string {
  const parts = event.message.content.parts;
  return parts
    .filter(
      (part): part is typeof part & { type: 'text'; text: string } =>
        part.type === 'text' && 'text' in part && typeof part.text === 'string',
    )
    .map((part) => part.text)
    .join('');
}

function normalizeRuntimeErrorCode(value: unknown): string {
  const normalized = String(value ?? 'MASTRA_RUNTIME_ERROR')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || 'MASTRA_RUNTIME_ERROR';
}

function publicRuntimeError(errorType?: unknown): { code: string; message: string } {
  return {
    code: normalizeRuntimeErrorCode(errorType),
    // Do not serialize provider/model/tool raw errors. They may contain request
    // URLs, headers, response bodies, or credentials. Detailed errors belong in
    // server-side observability only.
    message: 'AI runtime request failed',
  };
}

export interface MastraAIRuntimeDependencies {
  readonly storage: MastraCompositeStore;
  readonly modelResolver: MastraModelResolver;
  readonly transcriptBootstrapSource: AssistantTranscriptBootstrapSource;
  /** Host-bound canonical Goal/Task/Reminder application mutations for ADR-052. */
  readonly goalPlanMutationPort: GoalPlanMutationPort;
  /** Host-bound canonical Task application mutation for the task.create workflow. */
  readonly taskPlanMutationPort: TaskPlanMutationPort;
  /** Host-bound canonical knowledge-note persistence mutation for knowledge.capture. */
  readonly knowledgeCaptureMutationPort: KnowledgeCaptureMutationPort;
  /** Canonical runtime observability sink; host-owned and persistence-agnostic. */
  readonly executionLogPort?: IAIExecutionLogPort;
  /** Durable indexed usage projection for run/thread queries and workflow views. */
  readonly usageReadPort?: IAIUsageReadPort;
  readonly routineCommandPort: IAIRoutineCommandPort;
  readonly plannerReadPort: IAIPlannerReadPort;
  readonly notificationReadPort: IAINotificationReadPort;
  /** Identity-scoped Product Time context injected into every model-facing request. */
  readonly userTimeContextPort: UserTimeContextPort;
}

type ActiveRun = {
  readonly identityId: string;
  readonly abort: () => void;
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

  constructor(private readonly deps: MastraAIRuntimeDependencies) {
    this.memory = new Memory({
      storage: deps.storage,
      options: { lastMessages: 40 },
    });
    this.history = new AssistantHistoryService(this.memory, deps.transcriptBootstrapSource);
    this.assistant = createMemoFlowAssistant({
      modelResolver: deps.modelResolver,
      memory: this.memory,
    });
    const productTools = createMemoFlowProductTools({
      routineCommandPort: deps.routineCommandPort,
      plannerReadPort: deps.plannerReadPort,
      notificationReadPort: deps.notificationReadPort,
    });
    this.goalPlanner = new GoalPlannerWorker(deps.modelResolver, deps.executionLogPort);
    this.goalCreateWorkflow = createGoalCreateWorkflow({
      planner: this.goalPlanner,
      applyService: new ApplyGoalPlanService(deps.goalPlanMutationPort),
    });
    this.taskPlanner = new TaskPlannerWorker(deps.modelResolver, deps.executionLogPort);
    this.taskCreateWorkflow = createTaskCreateWorkflow({
      planner: this.taskPlanner,
      applyService: new ApplyTaskPlanService(deps.taskPlanMutationPort),
    });
    this.knowledgeCapturePlanner = new KnowledgeCapturePlannerWorker(
      deps.modelResolver,
      deps.executionLogPort,
    );
    this.knowledgeCaptureWorkflow = createKnowledgeCaptureWorkflow({
      planner: this.knowledgeCapturePlanner,
      applyService: new ApplyKnowledgeNoteService(deps.knowledgeCaptureMutationPort),
    });
    this.controller = new AgentController({
      id: 'memoflow-assistant-controller',
      storage: deps.storage,
      memory: this.memory,
      agent: this.assistant,
      modes: [{
        id: 'assistant',
        name: 'Assistant',
        tools: productTools,
        availableTools: Object.keys(productTools),
      }],
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
    const timeContext = await this.deps.userTimeContextPort.getUserTimeContext(context.identityId);
    requestContext.setRaw('identityId', context.identityId);
    requestContext.setRaw('locale', input.locale ?? 'zh-CN');
    requestContext.setRaw('timeContext', timeContext);
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
    let result: Extract<AIWorkflowRunView, { kind: 'goal.create' }>['result'];

    if (lowLevelStatus === 'suspended') {
      status = 'suspended';
      const parsed = AIWorkflowSuspensionSchema.safeParse(lifecycleRecord?.suspendPayload);
      if (!parsed.success) throw new Error('AI_WORKFLOW_SNAPSHOT_CORRUPT');
      suspension = parsed.data;
    } else if (lowLevelStatus === 'canceled') {
      status = 'cancelled';
    } else if (lowLevelStatus === 'failed' || lowLevelStatus === 'tripwire') {
      status = 'failed';
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
    let result: Extract<AIWorkflowRunView, { kind: 'task.create' }>['result'];

    if (lowLevelStatus === 'suspended') {
      status = 'suspended';
      const parsed = AIWorkflowSuspensionSchema.safeParse(lifecycleRecord?.suspendPayload);
      if (!parsed.success) throw new Error('AI_WORKFLOW_SNAPSHOT_CORRUPT');
      suspension = parsed.data;
    } else if (lowLevelStatus === 'canceled') {
      status = 'cancelled';
    } else if (lowLevelStatus === 'failed' || lowLevelStatus === 'tripwire') {
      status = 'failed';
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
    let result: Extract<AIWorkflowRunView, { kind: 'knowledge.capture' }>['result'];

    if (lowLevelStatus === 'suspended') {
      status = 'suspended';
      const parsed = AIWorkflowSuspensionSchema.safeParse(lifecycleRecord?.suspendPayload);
      if (!parsed.success) throw new Error('AI_WORKFLOW_SNAPSHOT_CORRUPT');
      suspension = parsed.data;
    } else if (lowLevelStatus === 'canceled') {
      status = 'cancelled';
    } else if (lowLevelStatus === 'failed' || lowLevelStatus === 'tripwire') {
      status = 'failed';
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
      return this.attachWorkflowUsage(this.projectGoalCreateRun(goalRow, input.identityId), input.identityId);
    }
    const taskRow = await store.getWorkflowRunById({
      workflowName: TASK_CREATE_WORKFLOW_ID,
      runId: input.runId,
    });
    if (taskRow) {
      return this.attachWorkflowUsage(this.projectTaskCreateRun(taskRow, input.identityId), input.identityId);
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
    active.abort();
    return true;
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
    });
    const requestContext = new RequestContext();
    const timeContext = await this.deps.userTimeContextPort.getUserTimeContext(input.identityId);
    requestContext.setRaw('identityId', input.identityId);
    requestContext.setRaw('timeContext', timeContext);
    requestContext.setRaw('providerId', resolvedModel.providerId);
    requestContext.setRaw('modelId', resolvedModel.modelId);
    requestContext.setRaw('locale', input.locale ?? 'zh-CN');
    if (input.context) requestContext.setRaw('executionContext', input.context);
    requestContext.setRaw(MASTRA_RESOURCE_ID_KEY, input.identityId);
    requestContext.setRaw(MASTRA_THREAD_ID_KEY, input.conversationId);

    const session = await this.controller.createSession({
      id: `conversation:${input.conversationId}`,
      ownerId: input.identityId,
      resourceId: input.identityId,
      threadId: input.conversationId,
      requestContext,
    });
    const queue = new AsyncEventQueue<AssistantRuntimeEvent>();
    const fallbackRunId = `turn:${input.conversationId}:${randomUUID()}`;
    let runId = '';
    let sequence = 0;
    let lastText = '';
    let lastDeltaLength = 0;
    let assistantMessageId: string | undefined;
    let lastRuntimeError: { code: string; message: string } | undefined;
    let lastUsage: AssistantUsageSnapshot | undefined;
    const observabilityWrites: Promise<void>[] = [];
    let settled = false;

    const currentRunId = (): string => runId || session.getCurrentRunId() || fallbackRunId;

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

      if (this.deps.executionLogPort) {
        observabilityWrites.push(
          this.deps.executionLogPort.record(
            createAssistantExecutionLog({
              identityId: input.identityId,
              ...(input.context ? { context: input.context } : {}),
              conversationId: input.conversationId,
              contentLength: input.content.length,
              model: resolvedModel,
              runId: currentRunId(),
              ...(assistantMessageId ? { assistantMessageId } : {}),
              responseLength: lastText.length,
              outcome: type,
              ...(lastUsage ? { usage: lastUsage } : {}),
              ...(lastRuntimeError?.code ? { runtimeErrorCode: lastRuntimeError.code } : {}),
              processingMs: Date.now() - startedAt,
            }),
          ),
        );
      }
      this.activeRuns.delete(currentRunId());
      queue.end();
    };

    const unsubscribe = session.subscribe((event) => {
      if (event.type === 'agent_start') {
        runId = session.getCurrentRunId() ?? fallbackRunId;
        this.activeRuns.set(runId, {
          identityId: input.identityId,
          abort: () => session.abortRun(),
        });
        emit('assistant.run.started', {
          modelId: resolvedModel.modelId,
          providerId: resolvedModel.providerId,
        });
        return;
      }
      if (event.type === 'message_update' && event.message.role === 'assistant') {
        const text = messageText(event);
        assistantMessageId = event.message.id;
        if (text.length > lastDeltaLength) {
          emit('assistant.message.delta', { content: text.slice(lastDeltaLength) });
          lastDeltaLength = text.length;
          lastText = text;
        }
        return;
      }
      if (event.type === 'message_end' && event.message.role === 'assistant') {
        lastText = messageText(event);
        assistantMessageId = event.message.id;
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
        lastRuntimeError = publicRuntimeError(event.errorType);
        return;
      }
      if (event.type === 'agent_end') {
        if (event.reason === 'aborted') settle('assistant.run.cancelled');
        else if (event.reason === 'error') settle('assistant.run.failed');
        else settle('assistant.run.completed');
      }
    });

    const abort = () => session.abortRun();
    input.signal?.addEventListener('abort', abort, { once: true });
    void session.sendMessage({ content: input.content, requestContext }).catch(() => {
      lastRuntimeError = publicRuntimeError();
      settle('assistant.run.failed');
    });

    try {
      while (true) {
        const next = await queue.next();
        if (next.done) break;
        yield next.value;
      }
    } finally {
      input.signal?.removeEventListener('abort', abort);
      unsubscribe();
      if (runId) this.activeRuns.delete(runId);
      if (observabilityWrites.length > 0) {
        await Promise.allSettled(observabilityWrites);
      }
    }
  }
}
