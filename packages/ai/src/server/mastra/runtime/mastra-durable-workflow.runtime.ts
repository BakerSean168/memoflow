import {
  MASTRA_RESOURCE_ID_KEY,
  MASTRA_THREAD_ID_KEY,
  RequestContext,
} from '@mastra/core/request-context';
import type { MastraCompositeStore } from '@mastra/core/storage';
import {
  AIWorkflowRunViewSchema,
  GoalCreateWorkflowInputSchema,
  KnowledgeCaptureWorkflowInputSchema,
  TaskCreateWorkflowInputSchema,
  type AIWorkflowResumeClientRequest,
  type AIWorkflowRunView,
  type AIWorkflowStartClientRequest,
} from '@memoflow/contracts/ai';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import type { IAIUsageReadPort } from '../../application/ports';
import {
  GOAL_CREATE_LIFECYCLE_STEP_ID,
  GOAL_CREATE_WORKFLOW_ID,
  initialGoalCreateWorkflowState,
  TASK_CREATE_LIFECYCLE_STEP_ID,
  TASK_CREATE_WORKFLOW_ID,
  initialTaskCreateWorkflowState,
  KNOWLEDGE_CAPTURE_LIFECYCLE_STEP_ID,
  KNOWLEDGE_CAPTURE_WORKFLOW_ID,
  initialKnowledgeCaptureWorkflowState,
  type createGoalCreateWorkflow,
  type createTaskCreateWorkflow,
  type createKnowledgeCaptureWorkflow,
} from '../workflows';
import type { AssistantHistoryService } from './assistant-history.service';
import type { AIWorkflowRuntimePort } from './workflow-runtime.port';
import { workflowInputFromSnapshot } from './workflow-run-snapshot';
import {
  projectGoalCreateRun,
  projectTaskCreateRun,
  projectKnowledgeCaptureRun,
} from './workflow-run-projection';

type DurableWorkflowDependencies = {
  readonly storage: Pick<MastraCompositeStore, 'getStore'>;
  readonly history: Pick<AssistantHistoryService, 'appendUserTurn'>;
  readonly usageReadPort?: IAIUsageReadPort;
  readonly goalCreateWorkflow: ReturnType<typeof createGoalCreateWorkflow>;
  readonly taskCreateWorkflow: ReturnType<typeof createTaskCreateWorkflow>;
  readonly knowledgeCaptureWorkflow: ReturnType<typeof createKnowledgeCaptureWorkflow>;
};

/**
 * Internal workflow operations over the facade's existing Mastra instances.
 * MastraAIRuntime owns composition and initializes dependencies before delegation.
 */
export class MastraDurableWorkflowRuntime implements AIWorkflowRuntimePort {
  constructor(private readonly deps: DurableWorkflowDependencies) {}

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

  private runningWorkflowView(input: {
    runId: string;
    kind: AIWorkflowRunView['kind'];
    conversationId: string;
    createdAt?: number;
  }): AIWorkflowRunView {
    const now = Date.now();
    return AIWorkflowRunViewSchema.parse({
      runId: input.runId,
      kind: input.kind,
      conversationId: input.conversationId,
      status: 'running',
      createdAt: input.createdAt ?? now,
      updatedAt: now,
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
        await this.deps.history.appendUserTurn({
          ...input.request,
          ...input.context,
          content: workflowTurn,
        });
      const run = await this.deps.goalCreateWorkflow.createRun({
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
      const run = await this.deps.taskCreateWorkflow.createRun({
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
    const run = await this.deps.knowledgeCaptureWorkflow.createRun({
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

  async startDetached(input: {
    context: ExecutionContext;
    request: AIWorkflowStartClientRequest;
  }): Promise<AIWorkflowRunView> {
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
      if (input.request.workflowTurn) {
        await this.deps.history.appendUserTurn({
          ...input.request,
          ...input.context,
          content: input.request.workflowTurn,
        });
      }
      const run = await this.deps.goalCreateWorkflow.createRun({
        resourceId: input.context.identityId,
      });
      await run.startAsync({
        inputData: goalInput,
        initialState: initialGoalCreateWorkflowState(goalInput),
        requestContext: await this.workflowRequestContext(input.context, goalInput),
      });
      return this.runningWorkflowView({
        runId: run.runId,
        kind: 'goal.create',
        conversationId: goalInput.conversationId,
      });
    }

    if (input.request.kind === 'task.create') {
      const taskInput = TaskCreateWorkflowInputSchema.parse(workflowInput);
      const run = await this.deps.taskCreateWorkflow.createRun({
        resourceId: input.context.identityId,
      });
      await run.startAsync({
        inputData: taskInput,
        initialState: initialTaskCreateWorkflowState(taskInput),
        requestContext: await this.workflowRequestContext(input.context, taskInput),
      });
      return this.runningWorkflowView({
        runId: run.runId,
        kind: 'task.create',
        conversationId: taskInput.conversationId,
      });
    }

    const knowledgeInput = KnowledgeCaptureWorkflowInputSchema.parse(workflowInput);
    const run = await this.deps.knowledgeCaptureWorkflow.createRun({
      resourceId: input.context.identityId,
    });
    await run.startAsync({
      inputData: knowledgeInput,
      initialState: initialKnowledgeCaptureWorkflowState(knowledgeInput),
      requestContext: await this.workflowRequestContext(input.context, knowledgeInput),
    });
    return this.runningWorkflowView({
      runId: run.runId,
      kind: 'knowledge.capture',
      conversationId: knowledgeInput.conversationId,
    });
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
      await this.deps.history.appendUserTurn({
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
    const workflowInput = workflowInputFromSnapshot(workflowName, row.snapshot);
    const workflow =
      before.kind === 'goal.create'
        ? this.deps.goalCreateWorkflow
        : before.kind === 'task.create'
          ? this.deps.taskCreateWorkflow
          : this.deps.knowledgeCaptureWorkflow;
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

  async resumeDetached(input: {
    context: ExecutionContext;
    request: AIWorkflowResumeClientRequest;
  }): Promise<AIWorkflowRunView> {
    const before = await this.get({
      identityId: input.context.identityId,
      runId: input.request.runId,
    });
    if (!before) throw new Error('AI_WORKFLOW_RUN_NOT_FOUND');
    if (
      before.status === 'completed' ||
      before.status === 'failed' ||
      before.status === 'cancelled' ||
      before.status === 'running'
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
      await this.deps.history.appendUserTurn({
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
    const workflowInput = workflowInputFromSnapshot(workflowName, row.snapshot);
    const workflow =
      before.kind === 'goal.create'
        ? this.deps.goalCreateWorkflow
        : before.kind === 'task.create'
          ? this.deps.taskCreateWorkflow
          : this.deps.knowledgeCaptureWorkflow;
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
    await run.resumeAsync({
      step: lifecycleStepId,
      resumeData: input.request.command,
      requestContext: await this.workflowRequestContext(input.context, workflowInput),
    });
    return this.runningWorkflowView({
      runId: before.runId,
      kind: before.kind,
      conversationId: before.conversationId,
      createdAt: before.createdAt,
    });
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

  async get(input: { identityId: string; runId: string }): Promise<AIWorkflowRunView | null> {
    const store = await this.workflowStore();
    const goalRow = await store.getWorkflowRunById({
      workflowName: GOAL_CREATE_WORKFLOW_ID,
      runId: input.runId,
    });
    if (goalRow) {
      return this.attachWorkflowUsage(
        projectGoalCreateRun(goalRow, input.identityId),
        input.identityId,
      );
    }
    const taskRow = await store.getWorkflowRunById({
      workflowName: TASK_CREATE_WORKFLOW_ID,
      runId: input.runId,
    });
    if (taskRow) {
      return this.attachWorkflowUsage(
        projectTaskCreateRun(taskRow, input.identityId),
        input.identityId,
      );
    }
    const knowledgeRow = await store.getWorkflowRunById({
      workflowName: KNOWLEDGE_CAPTURE_WORKFLOW_ID,
      runId: input.runId,
    });
    if (knowledgeRow) {
      return this.attachWorkflowUsage(
        projectKnowledgeCaptureRun(knowledgeRow, input.identityId),
        input.identityId,
      );
    }
    return null;
  }

  async list(input: {
    identityId: string;
    conversationId?: string;
  }): Promise<readonly AIWorkflowRunView[]> {
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
      ...goalRows.runs.map((row) => projectGoalCreateRun(row, input.identityId)),
      ...taskRows.runs.map((row) => projectTaskCreateRun(row, input.identityId)),
      ...knowledgeRows.runs.map((row) => projectKnowledgeCaptureRun(row, input.identityId)),
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
        ? this.deps.goalCreateWorkflow
        : before.kind === 'task.create'
          ? this.deps.taskCreateWorkflow
          : this.deps.knowledgeCaptureWorkflow;
    const run = await workflow.createRun({
      runId: input.runId,
      resourceId: input.identityId,
    });
    await run.cancel();
    return this.get(input);
  }
}
