/**
 * createAIModule — explicit composition root for the AI server runtime.
 * createAIModule —— AI 模块服务端运行时的显式组合根。
 *
 * The outer app selects concrete adapters and passes them in here.
 * This module then assembles the application layer exactly once and exposes a
 * stable facade to HTTP / IPC transports.
 *
 * 外层应用负责选择具体适配器并传入这里。
 * 组合根只做一次组装，然后向 HTTP / IPC 等传输层暴露稳定门面。
 *
 * AI uses the governance module as its reference pattern: one composition root
 * per module, constructor injection only, no hidden service locator.
 * AI 模块以 governance 模块为参考模式：每个模块一个组合根，
 * 仅使用构造器注入，不使用隐藏的服务定位器。
 *
 * AI-VNEXT-07: Mastra is the ONLY runtime. The legacy Python AIService,
 * DirectTurn, LangGraph bridge and AgentHost runtime selection are removed.
 * The module assembles provider/conversation/knowledge services directly from
 * canonical use cases and owns the Mastra runtime lifecycle. Legacy AgentRun /
 * AssistantFacade / checkpoint application methods fail closed with
 * SERVICE_UNAVAILABLE — they are never backed by a second runtime.
 *
 * AI-VNEXT-07：Mastra 是唯一 runtime。旧 Python AIService / DirectTurn /
 * LangGraph bridge / AgentHost runtime 选择已删除。模块直接从规范 use case
 * 组装 provider/conversation/knowledge 服务，并托管 Mastra runtime 生命周期。
 * 旧 AgentRun / AssistantFacade / checkpoint 应用方法以 SERVICE_UNAVAILABLE
 * fail closed——绝不回退到第二个 runtime。
 *
 * @see {@link createGovernanceModule} in @memoflow/governance for the canonical example.
 */

import { ok, error } from '@memoflow/contracts/result';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import type { IAIConversationRepository, IAIProviderConfigRepository } from '../domain';
import type {
  AIEvaluationOperationsPort,
  AIKnowledgePort,
  AIProviderManagementPort,
  AssistantConversationPort,
} from '../application';
import { AIConversationPortableCapability } from '../application';
import type {
  IAIExecutionRecordPort,
  IAIEvaluationReportPort,
  IAnalyticsQueryPort,
  IAnalyticsReadPort,
  IKnowledgeIndexRepository,
  IKnowledgeQueryPort,
  IKnowledgeNotePersistencePort,
  IKnowledgeSourcePort,
  IKnowledgeIngestionPort,
  IAIProviderOnboardingCommitPort,
  IAIProviderOnboardingSessionRepository,
  IAIProviderSecretVault,
} from '../application/ports';

import { createLogger } from '@memoflow/utils/logger';
import { AI_PROVIDER_CATALOG } from '@memoflow/contracts/ai';
import type { AIWorkflowRuntimePort, MastraAIRuntime } from '../mastra/runtime';
import { assembleCapabilities } from '../shared/assemble-capabilities';
import { OpenAICompatibleChatExecutionAdapter } from './adapters/openai-compatible-chat-execution.adapter';
import { OpenAICompatibleAnalyticsQueryAdapter } from './adapters/openai-compatible-analytics-query.adapter';
import { DeterministicKnowledgeIngestionAdapter } from './adapters/deterministic-knowledge-ingestion.adapter';
import { OpenAICompatibleKnowledgeQueryAdapter } from './adapters/openai-compatible-knowledge-query.adapter';
import { OpenAICompatibleGateway } from './gateways/openai-compatible.gateway';
import { OpenAICompatibleModelCatalogGateway } from './gateways/openai-compatible-model-catalog.gateway';
import { OpenAICompatibleCredentialProbeGateway } from './gateways/openai-compatible-credential-probe.gateway';
import { ProviderEndpointPolicy } from './security/provider-endpoint-policy';
import { ProviderSafeFetch } from './security/provider-safe-fetch';
import { isAIExecutionError } from '../../shared/ai-execution-error';

import type { Result } from '@memoflow/contracts/result';
import type {
  ExpandKnowledgeReq,
  ExpandKnowledgeRes,
  QueryAnalyticsReq,
  QueryAnalyticsRes,
  GetAIEvaluationOverviewReq,
  GetAIEvaluationOverviewRes,
  QueryKnowledgeReq,
  QueryKnowledgeRes,
  ReindexKnowledgeReq,
  ReindexKnowledgeRes,
  ListAIProviderCatalogRes,
  ProbeAIProviderConnectionRes,
  TestAIProviderOnboardingModelRes,
} from '@memoflow/contracts/ai';

// Value imports for services assembled directly by this module.
import {
  UpdateAIProviderUseCase,
  DeleteAIProviderUseCase,
  GetAIProviderUseCase,
  ListAIProvidersUseCase,
  TestAIProviderConnectionUseCase,
  SetDefaultAIProviderUseCase,
  RefreshAIProviderModelsUseCase,
  CreateConversationUseCase,
  GetConversationUseCase,
  ListConversationsUseCase,
  DeleteConversationUseCase,
  UpdateConversationUseCase,
  SyncKnowledgeNotesUseCase,
  ReindexAllKnowledgeUseCase,
  SyncRelevantKnowledgeUseCase,
  SyncNoteByIdUseCase,
  RemoveKnowledgeIndexNoteUseCase,
  QueryKnowledgeUseCase,
  ExpandKnowledgeUseCase,
  ReindexKnowledgeUseCase,
  QueryAIAnalyticsUseCase,
  ManageAIEvaluationReportUseCase,
  ProbeAIProviderConnectionUseCase,
  TestAIProviderOnboardingModelUseCase,
  CommitAIProviderOnboardingUseCase,
  ProbeAIProviderReplacementUseCase,
  CommitAIProviderReplacementUseCase,
} from '../application/use-cases';

const logger = createLogger('AIModule');

// ---------------------------------------------------------------------------
// Dependencies — AI 模块服务端运行时向外部索取的全部依赖
// ---------------------------------------------------------------------------

/**
 * Everything the AI server runtime needs from the outside world.
 * AI 模块服务端运行时向外部索取的全部依赖。
 *
 * AI-VNEXT-07: legacy service ports (chat execution, goal planning, knowledge
 * ingestion/note generation, analytics query, agent runtime, checkpoints) are
 * removed — Mastra is the only runtime and the module no longer composes
 * Python AIService adapters.
 *
 * AI-VNEXT-07：旧服务 ports（chat execution、goal planning、knowledge
 * ingestion/note generation、analytics query、agent runtime、checkpoint）已删除——
 * Mastra 是唯一 runtime，模块不再组装 Python AIService adapter。
 *
 * Refactor rule for other modules:
 * - only put ports or runtime contributions here
 * - never put transport objects (Express req/res, ipcMain, Router) here
 * - never hide these dependencies behind a singleton container
 */
export interface AIModuleDependencies {
  readonly conversationRepository: IAIConversationRepository;
  readonly providerConfigRepository: IAIProviderConfigRepository;
  readonly providerSecretVault: IAIProviderSecretVault;
  readonly knowledgeIndexRepository?: IKnowledgeIndexRepository;
  readonly knowledgeIngestionPort?: IKnowledgeIngestionPort;
  readonly knowledgeQueryPort?: IKnowledgeQueryPort;
  readonly knowledgeSourcePort?: IKnowledgeSourcePort;
  readonly analyticsReadPort?: IAnalyticsReadPort;
  readonly analyticsQueryPort?: IAnalyticsQueryPort;
  readonly executionRecordPort?: IAIExecutionRecordPort;
  readonly evaluationReportPort?: IAIEvaluationReportPort;
  /** Short-lived identity-bound Provider onboarding state selected by the host. */
  readonly providerOnboardingSessionRepository?: IAIProviderOnboardingSessionRepository;
  /** Host-owned atomic Provider+onboarding persistence boundary. */
  readonly providerOnboardingCommitPort?: IAIProviderOnboardingCommitPort;

  /**
   * Mastra-native vNext runtime. Hosts compose its storage/model dependencies;
   * this module only owns its lifecycle.
   */
  readonly mastraRuntime?: MastraAIRuntime;
  /**
   * Canonical vNext Workflow runtime seam. Batch C provides the first concrete
   * Mastra implementation; transports already fail closed when it is absent.
   */
  readonly workflowRuntime?: AIWorkflowRuntimePort;

  /**
   * Knowledge-note persistence is an external collaborator.
   * 知识笔记持久化是一个外部协作者。
   *
   * The host application (API / Electron) decides how notes are stored.
   * 宿主应用（API / Electron）决定笔记如何存储。
   */
  readonly knowledgeNotePersistence?: IKnowledgeNotePersistencePort;

  /**
   * Optional runtime side effects to start/stop with the module.
   * 可选的运行时副作用，随模块一起启动/停止。
   */
  readonly runtimeContributions?: AIRuntimeContributionsInput;
}

// ---------------------------------------------------------------------------
// Runtime contributions — 模块拥有的运行时副作用
// ---------------------------------------------------------------------------

export type AIRuntimeContributionsInput =
  AIModuleRuntimeContribution | readonly AIModuleRuntimeContribution[];

/**
 * Module-owned runtime side effects.
 * 模块拥有的运行时副作用。
 *
 * A contribution is the unit we start/stop together with the module instance.
 * This is the replacement for older global initialization hooks.
 */
export interface AIModuleRuntimeContribution {
  start(): void;
  stop(): void;
}

/**
 * Provider config decomposed use cases.
 */
export interface AIProviderServices {
  readonly update: UpdateAIProviderUseCase;
  readonly delete: DeleteAIProviderUseCase;
  readonly get: GetAIProviderUseCase;
  readonly list: ListAIProvidersUseCase;
  readonly testConnection: TestAIProviderConnectionUseCase;
  readonly setDefault: SetDefaultAIProviderUseCase;
  readonly refreshModels: RefreshAIProviderModelsUseCase;
  readonly probe?: ProbeAIProviderConnectionUseCase;
  readonly testOnboardingModel?: TestAIProviderOnboardingModelUseCase;
  readonly commitOnboarding?: CommitAIProviderOnboardingUseCase;
  readonly probeReplacement?: ProbeAIProviderReplacementUseCase;
  readonly commitReplacement?: CommitAIProviderReplacementUseCase;
}

/**
 * Conversation use cases (canonical host path).
 */
export interface AIConversationServices {
  readonly createConversation: CreateConversationUseCase;
  readonly getConversation: GetConversationUseCase;
  readonly listConversations: ListConversationsUseCase;
  readonly deleteConversation: DeleteConversationUseCase;
  readonly updateConversation: UpdateConversationUseCase;
}

/**
 * Knowledge index decomposed use cases.
 */
export interface AIKnowledgeIndexServices {
  readonly syncResources: SyncKnowledgeNotesUseCase;
  readonly reindexAll: ReindexAllKnowledgeUseCase;
  readonly syncRelevant: SyncRelevantKnowledgeUseCase;
  readonly syncById: SyncNoteByIdUseCase;
  readonly removeById: RemoveKnowledgeIndexNoteUseCase;
}

/**
 * Knowledge query decomposed use cases.
 */
export interface AIKnowledgeQueryServices {
  readonly isAvailable: boolean;
  readonly query: {
    execute(req: QueryKnowledgeReq, cx: ExecutionContext): Promise<Result<QueryKnowledgeRes>>;
  };
  readonly expand: {
    execute(req: ExpandKnowledgeReq, cx: ExecutionContext): Promise<Result<ExpandKnowledgeRes>>;
  };
  readonly reindex: {
    execute(req: ReindexKnowledgeReq, cx: ExecutionContext): Promise<Result<ReindexKnowledgeRes>>;
  };
}

export interface AIAnalyticsQueryService {
  readonly isAvailable: boolean;
  queryAnalytics(req: QueryAnalyticsReq, cx: ExecutionContext): Promise<Result<QueryAnalyticsRes>>;
}

export interface AIEvaluationReportService {
  readonly isAvailable: boolean;
  getOverview(req?: GetAIEvaluationOverviewReq): Promise<Result<GetAIEvaluationOverviewRes>>;
}

/**
 * Higher-level assembled services used by controllers.
 * 控制器使用的高层服务集合。
 *
 * AI-VNEXT-07: `chatServices`, `goalGenerationService`, `agentRuntimeService`
 * and the checkpoint surface are removed — open chat and workflows are owned by
 * the Mastra runtime.
 *
 * AI-VNEXT-07：`chatServices`、`goalGenerationService`、`agentRuntimeService`
 * 与 checkpoint surface 已删除——open chat 与 workflow 由 Mastra runtime 承载。
 */
export interface AIModuleServices {
  readonly providerServices: AIProviderServices;
  readonly conversationServices: AIConversationServices;
  readonly knowledgeIndexServices: AIKnowledgeIndexServices | null;
  readonly knowledgeQueryServices: AIKnowledgeQueryServices;
  readonly analyticsQueryService: AIAnalyticsQueryService;
  readonly evaluationReportService: AIEvaluationReportService;
}

// ---------------------------------------------------------------------------
// Module Instance — 主组合根返回类型
// ---------------------------------------------------------------------------

/**
 * Primary AI composition root return type.
 * AI 模块主组合根返回类型。
 *
 * The four capability properties are the transport-facing application seams.
 * `services` exposes higher-level orchestrators for module-internal use.
 * `start` / `dispose` own runtime side effects.
 *
 * AI-VNEXT-07: `turnEngine`, `readonlyTurnEngine`, `workflowAdapter`,
 * `proposalKernel`, `capabilityResolver`, `modelGateway` and `assistantFacade`
 * are removed — Mastra is the only runtime.
 */
export interface AIModuleInstance {
  readonly conversationRepository: IAIConversationRepository;
  readonly providerConfigRepository: IAIProviderConfigRepository;
  /** AI-owner V3 portability for product Conversation shells. */
  readonly portableCapability: AIConversationPortableCapability;
  readonly services: AIModuleServices;
  readonly providerManagement: AIProviderManagementPort;
  readonly assistantConversation: AssistantConversationPort;
  readonly knowledge: AIKnowledgePort;
  readonly evaluationOperations: AIEvaluationOperationsPort;
  /** Mastra-native Assistant execution surface. */
  readonly mastraRuntime: MastraAIRuntime | null;
  /** Canonical Workflow execution surface; null until a Mastra workflow runtime is composed. */
  readonly workflowRuntime: AIWorkflowRuntimePort | null;
  start(): Promise<void> | void;
  dispose(): Promise<void> | void;
}

/** Narrow instance view shared by the API and Desktop transport composers. */
export type AITransportModuleInstance = Pick<
  AIModuleInstance,
  | 'providerManagement'
  | 'assistantConversation'
  | 'knowledge'
  | 'evaluationOperations'
  | 'mastraRuntime'
  | 'workflowRuntime'
  | 'start'
  | 'dispose'
>;

async function getKnowledgeIndexDiagnostics(
  dependencies: AIModuleDependencies,
  supportsKnowledgeQuery: boolean,
) {
  if (!supportsKnowledgeQuery || !dependencies.knowledgeIndexRepository) {
    return undefined;
  }

  try {
    return await dependencies.knowledgeIndexRepository.getDiagnostics();
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeRuntimeContributions(
  runtimeContributions?: AIRuntimeContributionsInput,
): readonly AIModuleRuntimeContribution[] {
  if (!runtimeContributions) {
    return [];
  }

  if (Array.isArray(runtimeContributions)) {
    return Array.from(runtimeContributions);
  }

  return [runtimeContributions as AIModuleRuntimeContribution];
}

function unavailable<T>(): Promise<Result<T>> {
  return Promise.resolve(error('SERVICE_UNAVAILABLE', 'This capability is not available'));
}

function providerOnboardingFailure<T>(cause: unknown): Result<T> {
  if (!isAIExecutionError(cause)) {
    return error('INTERNAL_ERROR', 'AI provider onboarding failed');
  }
  switch (cause.category) {
    case 'unauthorized':
      return error('PROVIDER_AUTH_FAILED', 'AI provider authentication failed');
    case 'rate_limited':
      return error('RATE_LIMITED', 'AI provider rate limit exceeded');
    case 'timeout':
      return error('TIMEOUT', 'AI provider request timed out');
    case 'validation':
    case 'structured_output':
      return error('VALIDATION_ERROR', cause.message);
    case 'model_not_available':
      return error('MODEL_NOT_AVAILABLE', 'AI model is not available');
    case 'configuration_required':
      return error('AI_CONFIGURATION_REQUIRED', 'AI provider and model configuration is required');
    case 'capability_unsupported':
      return error('AI_CAPABILITY_UNSUPPORTED', 'AI model capability is unsupported');
    case 'capability_unverified':
      return error('AI_CAPABILITY_UNVERIFIED', 'AI model capability is not verified');
    case 'not_found':
      return error('NOT_FOUND', cause.message);
    case 'conflict':
      return error('CONFLICT', cause.message);
    case 'aborted':
      return error('CANCELED', 'AI provider request was canceled');
    case 'provider_unavailable':
    case 'upstream_provider_error':
    case 'transport':
      return error('SERVICE_UNAVAILABLE', 'AI provider is unavailable');
    case 'internal':
      return error('INTERNAL_ERROR', 'AI provider onboarding failed');
  }
}

function providerCatalogDto(): ListAIProviderCatalogRes {
  return AI_PROVIDER_CATALOG.map((entry) => ({
    id: entry.id,
    name: entry.name,
    description: entry.description,
    icon: entry.icon,
    protocol: entry.protocol,
    defaultBaseUrl: entry.defaultBaseUrl,
    baseUrlEditable: entry.baseUrlEditable,
    authKind: entry.authKind,
    ...(entry.docsUrl ? { docsUrl: entry.docsUrl } : {}),
    ...(entry.apiKeyUrl ? { apiKeyUrl: entry.apiKeyUrl } : {}),
    recommendedModelIds: [...entry.recommendedModelIds],
    capabilities: { ...entry.capabilities },
  }));
}

// ---------------------------------------------------------------------------
// Composition Root — 规范化的 AI 模块主组合根
// ---------------------------------------------------------------------------

/**
 * Canonical composition root.
 * 规范化的 AI 模块主组合根。
 *
 * AI-VNEXT-07: services are assembled directly from canonical use cases; the
 * Mastra runtime is the only runtime. Legacy dual-runtime selection and
 * AgentHost lifecycle objects are gone. Legacy AgentRun / AssistantFacade /
 * checkpoint application methods fail closed.
 *
 * AI-VNEXT-07：服务直接从规范 use case 组装；Mastra runtime 是唯一 runtime。
 * 旧双 runtime 选择与 AgentHost lifecycle 对象已删除。旧 AgentRun /
 * AssistantFacade / checkpoint 应用方法 fail closed。
 */
export function createAIModule(dependencies: AIModuleDependencies): AIModuleInstance {
  const { conversationRepository, providerConfigRepository } = dependencies;
  const portableCapability = new AIConversationPortableCapability(conversationRepository);

  // --- Runtime contributions (host-provided side effects) ---

  const runtimeContributions = normalizeRuntimeContributions(dependencies.runtimeContributions);

  // --- Services assembled directly from canonical use cases ---

  const providerEndpointPolicy = new ProviderEndpointPolicy();
  const providerSafeFetch = new ProviderSafeFetch({ policy: providerEndpointPolicy });
  const openAICompatibleGateway = new OpenAICompatibleGateway(providerSafeFetch.fetch);
  const chatExecutionAdapter = new OpenAICompatibleChatExecutionAdapter(openAICompatibleGateway);
  const modelCatalogGateway = new OpenAICompatibleModelCatalogGateway(providerSafeFetch.fetch);
  const onboardingSessionRepository = dependencies.providerOnboardingSessionRepository;
  const onboardingCommitPort = dependencies.providerOnboardingCommitPort;
  const onboardingAvailable = Boolean(onboardingSessionRepository && onboardingCommitPort);
  const probeProviderConnection =
    onboardingAvailable && onboardingSessionRepository
      ? new ProbeAIProviderConnectionUseCase({
          sessionRepository: onboardingSessionRepository,
          modelCatalog: modelCatalogGateway,
          credentialProbe: new OpenAICompatibleCredentialProbeGateway(providerSafeFetch.fetch),
          endpointPolicy: providerEndpointPolicy,
          secretVault: dependencies.providerSecretVault,
        })
      : null;

  const providerServices: AIProviderServices = {
    update: new UpdateAIProviderUseCase(providerConfigRepository),
    delete: new DeleteAIProviderUseCase(providerConfigRepository, dependencies.providerSecretVault),
    get: new GetAIProviderUseCase(providerConfigRepository),
    list: new ListAIProvidersUseCase(providerConfigRepository),
    testConnection: new TestAIProviderConnectionUseCase(
      providerConfigRepository,
      chatExecutionAdapter,
      dependencies.providerSecretVault,
    ),
    setDefault: new SetDefaultAIProviderUseCase(providerConfigRepository),
    refreshModels: new RefreshAIProviderModelsUseCase(
      providerConfigRepository,
      modelCatalogGateway,
      dependencies.providerSecretVault,
    ),
    ...(onboardingAvailable && onboardingSessionRepository && onboardingCommitPort
      ? {
          probe: probeProviderConnection!,
          probeReplacement: new ProbeAIProviderReplacementUseCase(
            providerConfigRepository,
            probeProviderConnection!,
          ),
          testOnboardingModel: new TestAIProviderOnboardingModelUseCase(
            onboardingSessionRepository,
            chatExecutionAdapter,
            dependencies.providerSecretVault,
          ),
          commitOnboarding: new CommitAIProviderOnboardingUseCase(
            onboardingSessionRepository,
            onboardingCommitPort,
          ),
          commitReplacement: new CommitAIProviderReplacementUseCase(
            providerConfigRepository,
            onboardingSessionRepository,
            onboardingCommitPort,
          ),
        }
      : {}),
  };

  const conversationServices: AIConversationServices = {
    createConversation: new CreateConversationUseCase(conversationRepository),
    getConversation: new GetConversationUseCase(conversationRepository),
    listConversations: new ListConversationsUseCase(conversationRepository),
    deleteConversation: new DeleteConversationUseCase(conversationRepository),
    updateConversation: new UpdateConversationUseCase(conversationRepository),
  };

  const knowledgeIngestionPort =
    dependencies.knowledgeIngestionPort ?? new DeterministicKnowledgeIngestionAdapter();
  const knowledgeQueryPort =
    dependencies.knowledgeQueryPort ??
    new OpenAICompatibleKnowledgeQueryAdapter(openAICompatibleGateway);
  const hasKnowledgeIndexStack = Boolean(
    dependencies.knowledgeIndexRepository && dependencies.knowledgeSourcePort,
  );

  const syncKnowledgeNotes = hasKnowledgeIndexStack
    ? new SyncKnowledgeNotesUseCase(
        dependencies.knowledgeIndexRepository!,
        knowledgeIngestionPort,
        dependencies.executionRecordPort,
      )
    : null;

  const knowledgeIndexServices: AIKnowledgeIndexServices | null =
    syncKnowledgeNotes && hasKnowledgeIndexStack
      ? {
          syncResources: syncKnowledgeNotes,
          reindexAll: new ReindexAllKnowledgeUseCase(
            dependencies.knowledgeSourcePort!,
            dependencies.knowledgeIndexRepository!,
            knowledgeIngestionPort,
            dependencies.executionRecordPort,
          ),
          syncRelevant: new SyncRelevantKnowledgeUseCase(
            dependencies.knowledgeSourcePort!,
            dependencies.knowledgeIndexRepository!,
            knowledgeIngestionPort,
            dependencies.executionRecordPort,
          ),
          syncById: new SyncNoteByIdUseCase(
            dependencies.knowledgeSourcePort!,
            dependencies.knowledgeIndexRepository!,
            knowledgeIngestionPort,
            dependencies.executionRecordPort,
          ),
          removeById: new RemoveKnowledgeIndexNoteUseCase(dependencies.knowledgeIndexRepository!),
        }
      : null;

  const knowledgeQueryServices: AIKnowledgeQueryServices = hasKnowledgeIndexStack
    ? {
        isAvailable: true,
        query: new QueryKnowledgeUseCase(
          providerConfigRepository,
          new SyncRelevantKnowledgeUseCase(
            dependencies.knowledgeSourcePort!,
            dependencies.knowledgeIndexRepository!,
            knowledgeIngestionPort,
            dependencies.executionRecordPort,
          ),
          knowledgeQueryPort,
          dependencies.executionRecordPort,
          dependencies.providerSecretVault,
        ),
        expand: new ExpandKnowledgeUseCase(
          providerConfigRepository,
          new SyncRelevantKnowledgeUseCase(
            dependencies.knowledgeSourcePort!,
            dependencies.knowledgeIndexRepository!,
            knowledgeIngestionPort,
            dependencies.executionRecordPort,
          ),
          knowledgeQueryPort,
          dependencies.executionRecordPort,
          dependencies.providerSecretVault,
        ),
        reindex: new ReindexKnowledgeUseCase(
          providerConfigRepository,
          new ReindexAllKnowledgeUseCase(
            dependencies.knowledgeSourcePort!,
            dependencies.knowledgeIndexRepository!,
            knowledgeIngestionPort,
            dependencies.executionRecordPort,
          ),
          undefined,
          dependencies.providerSecretVault,
        ),
      }
    : {
        isAvailable: false,
        query: { execute: () => unavailable<QueryKnowledgeRes>() },
        expand: { execute: () => unavailable<ExpandKnowledgeRes>() },
        reindex: { execute: () => unavailable<ReindexKnowledgeRes>() },
      };

  const analyticsQueryPort =
    dependencies.analyticsQueryPort ??
    new OpenAICompatibleAnalyticsQueryAdapter(openAICompatibleGateway);
  const analyticsQueryService: AIAnalyticsQueryService = dependencies.analyticsReadPort
    ? {
        isAvailable: true,
        queryAnalytics: (req, cx) =>
          new QueryAIAnalyticsUseCase(
            providerConfigRepository,
            dependencies.analyticsReadPort!,
            analyticsQueryPort,
            dependencies.executionRecordPort,
            dependencies.providerSecretVault,
          ).queryAnalytics(req, cx),
      }
    : {
        isAvailable: false,
        queryAnalytics: () => unavailable<QueryAnalyticsRes>(),
      };

  const evaluationReportService: AIEvaluationReportService = dependencies.evaluationReportPort
    ? {
        isAvailable: true,
        getOverview: (req = {}) =>
          new ManageAIEvaluationReportUseCase(dependencies.evaluationReportPort!).getOverview(req),
      }
    : {
        isAvailable: false,
        getOverview: () => unavailable<GetAIEvaluationOverviewRes>(),
      };

  const services: AIModuleServices = {
    providerServices,
    conversationServices,
    knowledgeIndexServices,
    knowledgeQueryServices,
    analyticsQueryService,
    evaluationReportService,
  };

  // --- Application capabilities: one projection per proven consumer boundary ---

  let started = false;

  const supportsKnowledgeQuery = hasKnowledgeIndexStack;
  const supportsKnowledgeNotes = Boolean(dependencies.knowledgeNotePersistence);

  const capabilities = assembleCapabilities('mastra', {
    supportsKnowledgeNotes,
    supportsKnowledgeQuery,
    supportsAnalyticsQuery: Boolean(dependencies.analyticsReadPort),
    supportsAssistantRuntime: Boolean(dependencies.mastraRuntime),
    supportsWorkflowRuntime: Boolean(dependencies.workflowRuntime),
    supportsEvaluationReports: Boolean(dependencies.evaluationReportPort),
  });

  const providerManagement: AIProviderManagementPort = {
    getCapabilities: async () =>
      ok({
        ...capabilities,
        knowledgeIndexDiagnostics: await getKnowledgeIndexDiagnostics(
          dependencies,
          supportsKnowledgeQuery,
        ),
      }),

    // -- Provider Onboarding V2 --
    getProviderCatalog: async () => ok(providerCatalogDto()),
    probeProviderConnection: async (req, cx) => {
      if (!services.providerServices.probe) return unavailable<ProbeAIProviderConnectionRes>();
      try {
        return ok(await services.providerServices.probe.execute(req, cx));
      } catch (cause) {
        return providerOnboardingFailure<ProbeAIProviderConnectionRes>(cause);
      }
    },
    testProviderOnboardingModel: async (req, cx) => {
      if (!services.providerServices.testOnboardingModel) {
        return unavailable<TestAIProviderOnboardingModelRes>();
      }
      try {
        return await services.providerServices.testOnboardingModel.execute(req, cx);
      } catch (cause) {
        return providerOnboardingFailure<TestAIProviderOnboardingModelRes>(cause);
      }
    },
    commitProviderOnboarding: async (req, cx) => {
      if (!services.providerServices.commitOnboarding) return unavailable();
      try {
        return await services.providerServices.commitOnboarding.execute(req, cx);
      } catch (cause) {
        return providerOnboardingFailure(cause);
      }
    },
    probeProviderReplacement: async (providerId, req, cx) => {
      if (!services.providerServices.probeReplacement)
        return unavailable<ProbeAIProviderConnectionRes>();
      try {
        return ok(await services.providerServices.probeReplacement.execute(providerId, req, cx));
      } catch (cause) {
        return providerOnboardingFailure<ProbeAIProviderConnectionRes>(cause);
      }
    },
    commitProviderReplacement: async (providerId, req, cx) => {
      if (!services.providerServices.commitReplacement) return unavailable();
      try {
        return await services.providerServices.commitReplacement.execute(providerId, req, cx);
      } catch (cause) {
        return providerOnboardingFailure(cause);
      }
    },

    // -- Saved Provider Config --
    updateProvider: (id, req, cx) =>
      services.providerServices.update.execute(cx.identityId, id, req),
    deleteProvider: (id, cx) => services.providerServices.delete.execute(cx.identityId, id),
    getProvider: (id, cx) => services.providerServices.get.execute(cx.identityId, id),
    listProviders: (cx) => services.providerServices.list.execute(cx),
    testConnection: (req, cx) => services.providerServices.testConnection.execute(req, cx),
    setDefaultProvider: (id, cx) => services.providerServices.setDefault.execute(id, cx),
    refreshProviderModels: (providerId, cx) =>
      services.providerServices.refreshModels.execute(providerId, cx),
  };

  const assistantConversation: AssistantConversationPort = {
    createConversation: (cx, name) =>
      services.conversationServices.createConversation.execute(cx, name),
    updateConversation: (id, req, cx) =>
      services.conversationServices.updateConversation.execute(cx.identityId, id, req),
    listConversations: (cx, page, pageSize) =>
      services.conversationServices.listConversations.execute(cx, page, pageSize),
    getConversation: async (id, cx) => {
      const result = await services.conversationServices.getConversation.execute(cx.identityId, id);
      if (!result.ok) return result;
      if (result.data === null) {
        return error('NOT_FOUND', 'Conversation not found');
      }
      return ok(result.data.toClientDTO());
    },
    deleteConversation: (id, cx) =>
      services.conversationServices.deleteConversation.execute(cx.identityId, id),
  };

  const knowledge: AIKnowledgePort = {
    expandKnowledge: (req, cx) => services.knowledgeQueryServices.expand.execute(req, cx),
    queryKnowledge: (req, cx) => services.knowledgeQueryServices.query.execute(req, cx),
    reindexKnowledge: (req, cx) => services.knowledgeQueryServices.reindex.execute(req, cx),
  };

  const evaluationOperations: AIEvaluationOperationsPort = {
    queryAnalytics: (req, cx) => services.analyticsQueryService.queryAnalytics(req, cx),
    getEvaluationOverview: (req = {}) => services.evaluationReportService.getOverview(req),
  };

  return {
    conversationRepository,
    providerConfigRepository,
    portableCapability,
    services,
    providerManagement,
    assistantConversation,
    knowledge,
    evaluationOperations,
    mastraRuntime: dependencies.mastraRuntime ?? null,
    workflowRuntime: dependencies.workflowRuntime ?? null,
    start(): Promise<void> | void {
      if (started) {
        return;
      }

      const startedContributions: AIModuleRuntimeContribution[] = [];
      for (const contribution of runtimeContributions) {
        try {
          contribution.start();
          startedContributions.push(contribution);
        } catch (error) {
          for (const startedContribution of [...startedContributions].reverse()) {
            try {
              startedContribution.stop();
            } catch (stopError) {
              logger.error(
                'AIModule: contribution stop failed during partial-start rollback',
                stopError,
              );
            }
          }
          throw error;
        }
      }

      started = true;
      if (!dependencies.mastraRuntime) {
        return;
      }

      return dependencies.mastraRuntime.init().catch(async (error) => {
        for (const startedContribution of [...startedContributions].reverse()) {
          try {
            startedContribution.stop();
          } catch (stopError) {
            logger.error(
              'AIModule: contribution stop failed during Mastra init rollback',
              stopError,
            );
          }
        }
        started = false;
        try {
          await dependencies.mastraRuntime?.dispose();
        } catch (disposeError) {
          logger.error('AIModule: Mastra dispose failed during init rollback', disposeError);
        }
        await providerSafeFetch.close().catch((closeError) => {
          logger.error(
            'AIModule: provider egress transport close failed during init rollback',
            closeError,
          );
        });
        throw error;
      });
    },
    async dispose(): Promise<void> {
      if (!started) {
        return;
      }

      for (const contribution of [...runtimeContributions].reverse()) {
        contribution.stop();
      }

      started = false;
      try {
        await dependencies.mastraRuntime?.dispose();
      } finally {
        await providerSafeFetch.close();
      }
    },
  };
}
