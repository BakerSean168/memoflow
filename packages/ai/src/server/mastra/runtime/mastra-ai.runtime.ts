import { AgentRegistryError } from '../../application/agent-instance/agent-instance.repository';
import { MastraDurableWorkflowRuntime } from './mastra-durable-workflow.runtime';
import { applyMemoFlowSessionToolPolicy, memoFlowToolCategory } from '../tools/product-tool-policy';
import { AgentController } from '@mastra/core/agent-controller';
import { askUserTool } from '@mastra/core/tools';
import { Mastra } from '@mastra/core/mastra';
import {
  MASTRA_RESOURCE_ID_KEY,
  MASTRA_THREAD_ID_KEY,
  RequestContext,
} from '@mastra/core/request-context';
import type { MastraCompositeStore } from '@mastra/core/storage';
import { Memory } from '@mastra/memory';
import {
  type AssistantRuntimeApprovalCommand,
  type AIWorkflowResumeClientRequest,
  type AIWorkflowRunView,
  type AIWorkflowStartClientRequest,
  type AssistantRuntimeEvent,
  type AssistantRuntimeHistoryView,
} from '@memoflow/contracts/ai';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import type {
  AIUsageSummary,
  AIModelSelectionInput,
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
import type { AgentInstanceRegistry } from '../../application/agent-instance/agent-instance.registry';
import { AIExecutionError } from '../../../shared/ai-execution-error';
import {
  AssistantSelectedContextHydrator,
  setAIContextRequestContext,
  type AIContextAssemblerPort,
} from '../context';
import {
  ApplyGoalPlanService,
  createGoalCreateWorkflow,
  type GoalPlanMutationPort,
  ApplyTaskPlanService,
  createTaskCreateWorkflow,
  type TaskPlanMutationPort,
  ApplyKnowledgeNoteService,
  createKnowledgeCaptureWorkflow,
  type KnowledgeCaptureMutationPort,
} from '../workflows';
import {
  AssistantTurnSession,
  type ActiveAssistantTurn,
  type AssistantTurnInput,
} from './assistant-turn-session';
import { AssistantHistoryService } from './assistant-history.service';
import type { AssistantConversationShellSource } from './assistant-conversation-shell.port';
import type { AIWorkflowRuntimePort } from './workflow-runtime.port';

export interface MastraAIRuntimeDependencies {
  readonly storage: MastraCompositeStore;
  readonly modelResolver: MastraModelResolver;
  /** Host-authoritative turn claim: one stable Mastra Agent identity per new conversation. */
  readonly agentRegistry?: Pick<AgentInstanceRegistry, 'assertTurnSelection'>;
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
  private readonly durableWorkflows: MastraDurableWorkflowRuntime;
  private initPromise: Promise<void> | null = null;
  private disposePromise: Promise<void> | null = null;
  private readonly activeRuns = new Map<string, ActiveAssistantTurn>();
  private readonly resumedRuns = new Set<string>();
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
          tools: { ...productTools, ask_user: askUserTool },
          availableTools: [...Object.keys(productTools), 'ask_user'],
        },
      ],
      defaultModeId: 'assistant',
      disableBuiltinTools: [
        'submit_plan',
        'task_write',
        'task_update',
        'task_complete',
        'task_check',
        'subagent',
      ],
    });
    this.controller.onSessionCreated((session) => applyMemoFlowSessionToolPolicy(session), {
      blocking: true,
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
    this.durableWorkflows = new MastraDurableWorkflowRuntime({
      agentRegistry: deps.agentRegistry,
      storage: deps.storage,
      history: this.history,
      usageReadPort: deps.usageReadPort,
      goalCreateWorkflow: this.goalCreateWorkflow,
      taskCreateWorkflow: this.taskCreateWorkflow,
      knowledgeCaptureWorkflow: this.knowledgeCaptureWorkflow,
    });
  }

  async assertModelSelection(input: AIModelSelectionInput): Promise<void> {
    await this.deps.modelResolver.resolve(input);
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

  async start(input: {
    context: ExecutionContext;
    request: AIWorkflowStartClientRequest;
  }): Promise<AIWorkflowRunView> {
    await this.init();
    return this.durableWorkflows.start(input);
  }

  async startDetached(input: {
    context: ExecutionContext;
    request: AIWorkflowStartClientRequest;
  }): Promise<AIWorkflowRunView> {
    await this.init();
    return this.durableWorkflows.startDetached(input);
  }

  async resume(input: {
    context: ExecutionContext;
    request: AIWorkflowResumeClientRequest;
  }): Promise<AIWorkflowRunView> {
    await this.init();
    return this.durableWorkflows.resume(input);
  }

  async resumeDetached(input: {
    context: ExecutionContext;
    request: AIWorkflowResumeClientRequest;
  }): Promise<AIWorkflowRunView> {
    await this.init();
    return this.durableWorkflows.resumeDetached(input);
  }

  async get(input: { identityId: string; runId: string }): Promise<AIWorkflowRunView | null> {
    await this.init();
    return this.durableWorkflows.get(input);
  }

  async list(input: {
    identityId: string;
    conversationId?: string;
  }): Promise<readonly AIWorkflowRunView[]> {
    await this.init();
    return this.durableWorkflows.list(input);
  }

  async cancel(input: { identityId: string; runId: string }): Promise<AIWorkflowRunView | null> {
    await this.init();
    return this.durableWorkflows.cancel(input);
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

  async listAskUserSuspensions(input: { identityId: string; conversationId: string }): Promise<readonly { runId: string; toolCallId: string; question: string; options?: { label: string; description?: string }[]; selectionMode?: 'single_select' | 'multi_select' }[]> {
    await this.init();
    const suspended = await this.assistant.listSuspendedRuns({ threadId: input.conversationId, resourceId: input.identityId });
    return suspended.runs.flatMap((run) => run.toolCalls.flatMap((call) => {
      if (call.toolName !== 'ask_user' || !call.toolCallId || !call.suspendPayload || typeof call.suspendPayload !== 'object' || Array.isArray(call.suspendPayload)) return [];
      const payload = call.suspendPayload as Record<string, unknown>;
      if (typeof payload.question !== 'string' || !payload.question.trim() || payload.question.length > 2000) return [];
      const options = Array.isArray(payload.options) ? payload.options.filter((option): option is { label: string; description?: string } => Boolean(option) && typeof option === 'object' && typeof (option as { label?: unknown }).label === 'string') : undefined;
      return [{ runId: run.runId, toolCallId: call.toolCallId, question: payload.question, ...(options?.length ? { options } : {}), ...(payload.selectionMode === 'single_select' || payload.selectionMode === 'multi_select' ? { selectionMode: payload.selectionMode } : {}) }];
    }));
  }

  async cancelAskUserSuspension(input: { context: ExecutionContext; command: import('@memoflow/contracts/ai').AssistantRuntimeToolAnswerCommand }): Promise<boolean> {
    if (input.command.action !== 'cancel' || !input.context.identityId || input.command.identityId) return false;
    const runs = await this.assistant.listSuspendedRuns({
      threadId: input.command.conversationId,
      resourceId: input.context.identityId,
    });
    const run = runs.runs.find((candidate) =>
      candidate.runId === input.command.runId &&
      candidate.threadId === input.command.conversationId &&
      candidate.resourceId === input.context.identityId,
    );
    const suspension = run?.toolCalls.find((call) =>
      call.toolCallId === input.command.toolCallId && call.toolName === 'ask_user',
    );
    if (!run || !suspension || this.resumedRuns.has(run.runId)) return false;
    this.resumedRuns.add(run.runId);
    const requestContext = new RequestContext();
    requestContext.setRaw('identityId', input.context.identityId);
    requestContext.setRaw('executionContext', input.context);
    requestContext.setRaw(MASTRA_RESOURCE_ID_KEY, input.context.identityId);
    requestContext.setRaw(MASTRA_THREAD_ID_KEY, input.command.conversationId);
    try {
      const resumed = await this.assistant.resumeStream(
        'The user cancelled this question. Continue without requiring an answer.',
        {
          runId: run.runId,
          toolCallId: suspension.toolCallId,
          memory: { thread: input.command.conversationId, resource: input.context.identityId },
          requestContext,
        },
      );
      await resumed.text;
      return true;
    } catch {
      return false;
    } finally {
      this.resumedRuns.delete(run.runId);
    }
  }

  async answerToolSuspension(input: {
    context: ExecutionContext;
    command: import('@memoflow/contracts/ai').AssistantRuntimeToolAnswerCommand;
  }): Promise<boolean> {
    if (input.command.action === 'cancel') return this.cancelAskUserSuspension(input);
    if (!input.context.identityId || input.command.identityId) return false;
    const active = this.activeRuns.get(input.command.runId);
    if (active && active.identityId === input.context.identityId && active.conversationId === input.command.conversationId) return active.answer(input.command, input.context);
    const runs = await this.assistant.listSuspendedRuns({ threadId: input.command.conversationId, resourceId: input.context.identityId });
    const run = runs.runs.find((candidate) => candidate.runId === input.command.runId && candidate.threadId === input.command.conversationId && candidate.resourceId === input.context.identityId);
    const suspended = run?.toolCalls.find((call) => call.toolCallId === input.command.toolCallId && call.toolName === 'ask_user');
    if (!run || !suspended || !suspended.suspendPayload || typeof suspended.suspendPayload !== 'object' || Array.isArray(suspended.suspendPayload)) return false;
    const payload = suspended.suspendPayload as { options?: { label?: unknown }[]; selectionMode?: unknown };
    if (payload.options) {
      const labels = new Set(payload.options.map((option) => option.label).filter((label): label is string => typeof label === 'string'));
      if (payload.selectionMode === 'multi_select') { if (!Array.isArray(input.command.answer) || !input.command.answer.length || input.command.answer.some((value) => !labels.has(value)) || new Set(input.command.answer).size !== input.command.answer.length) return false; }
      else if (typeof input.command.answer !== 'string' || !labels.has(input.command.answer)) return false;
    } else if (typeof input.command.answer !== 'string' || !input.command.answer.trim() || input.command.answer.length > 4000) return false;
    if (this.resumedRuns.has(run.runId)) return false;
    this.resumedRuns.add(run.runId);
    const requestContext = new RequestContext();
    requestContext.setRaw('identityId', input.context.identityId); requestContext.setRaw('executionContext', input.context);
    requestContext.setRaw(MASTRA_RESOURCE_ID_KEY, input.context.identityId); requestContext.setRaw(MASTRA_THREAD_ID_KEY, input.command.conversationId);
    try {
      const resumed = await this.assistant.resumeStream(input.command.answer, {
        runId: run.runId,
        toolCallId: input.command.toolCallId,
        memory: { thread: input.command.conversationId, resource: input.context.identityId },
        requestContext,
      });
      // resumeStream returns a MastraModelOutput immediately. Drain its result
      // before acknowledging the answer; otherwise the HTTP/IPC client reads
      // history before the resumed assistant turn has persisted any output.
      await resumed.text;
      return true;
    } catch { return false; }
    finally { this.resumedRuns.delete(run.runId); }
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

  async *dispatchMessage(
    input: AssistantTurnInput,
  ): AsyncGenerator<AssistantRuntimeEvent, void, void> {
    if (input.permissionMode && !['supervised', 'read-only'].includes(input.permissionMode))
      throw new AIExecutionError('configuration_required', 'Unsupported Mastra permission mode');
    await this.init();
    await this.history.ensureConversation({
      identityId: input.identityId,
      conversationId: input.conversationId,
    });
    if (input.context && input.context.identityId !== input.identityId) {
      throw new Error('Mastra Assistant execution context identity mismatch');
    }
    if (this.deps.agentRegistry) {
      try {
        await this.deps.agentRegistry.assertTurnSelection({
          owner: input.identityId,
          conversationId: input.conversationId,
          agentInstanceId: input.agentInstanceId,
          providerId: input.providerId,
          modelId: input.modelId,
        });
      } catch (cause) {
        if (!(cause instanceof AgentRegistryError)) throw cause;
        throw new AIExecutionError(
          'configuration_required',
          'Selected Agent instance is unavailable or its model is not bound',
        );
      }
    } else if (input.agentInstanceId) {
      throw new AIExecutionError('configuration_required', 'Agent instance Registry unavailable');
    }
    const startedAt = Date.now();
    const resolvedModel = await this.deps.modelResolver.resolve({
      identityId: input.identityId,
      agentInstanceId: input.agentInstanceId,
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
    requestContext.setRaw('permissionMode', input.permissionMode ?? 'supervised');
    if (input.agentInstanceId) requestContext.setRaw('agentInstanceId', input.agentInstanceId);
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
    await applyMemoFlowSessionToolPolicy(
      session,
      input.permissionMode === 'read-only' ? 'read-only' : 'supervised',
    );
    if (conversationBusy() || session.run.isRunning())
      throw new Error('Assistant conversation already has an active turn');
    yield* new AssistantTurnSession({
      session,
      activeRuns: this.activeRuns,
      requestContext,
      model: resolvedModel,
      startedAt,
      executionRecordPort: this.deps.executionRecordPort,
    }).run(input);
  }
}
