import type { GoalNativeDraftState } from '@memoflow/goal-client';
export interface GoalAIEditSurface {
  openCreate(): Promise<GoalNativeEditSession>;
  openExisting(id: string): Promise<GoalNativeEditSession>;
  locate(): GoalNativeEditSession | null;
  isAvailable(): boolean;
  openControlledCreate(ownerId: string): Promise<GoalNativeEditSession>;
  /** Explicit restart intent may reclaim this exact mounted user draft without reopening it. */
  reclaimControlledCreate(
    ownerId: string,
    session: GoalNativeEditSession,
    snapshot: GoalNativeDraftState,
  ): GoalNativeEditSession;
  openControlled(
    ownerId: string,
    options?: { mode?: 'create' | 'edit'; goalId?: string },
  ): Promise<GoalNativeEditSession>;
  getControlledSession(ownerId: string): GoalNativeEditSession | null;
  releaseControlledSession(ownerId: string): void;
}

import type { GoalClientDTO } from '@memoflow/goal-contracts';
import type { TaskPlanClientDTO } from '@memoflow/task-contracts';
import type { ConfirmedLocalVaultWriteReq } from '@memoflow/repository-contracts';
import type { GoalNativeEditSession } from '@memoflow/goal-client';
import type { KnowledgeCaptureNativeDraft } from './host-ports/knowledge-session';
import type { KnowledgeDraft } from '@memoflow/ai-contracts';
import type { InjectionKey, Ref, ShallowRef } from 'vue';
import type { RouteLocationNormalized } from 'vue-router';
import type {
  AIClientPort,
  AssistantRuntimeClient,
  WorkflowRuntimeClient,
  RuntimeUsageClient,
  AgentRegistryClient,
  LocalAgentClient,
  WorkspaceEventStreamOptions,
} from '@memoflow/ai-client';
import type { AIRuntimeSurface } from '@memoflow/ai-contracts';
import type { GoalClientPort } from '@memoflow/goal-client';
import type { TaskClientPort } from '@memoflow/task-client';
import type { RepositoryClientPort } from '@memoflow/repository-client';
import type { LabelClientDTO } from '@memoflow/label-contracts';
import type { TaskNativeEditSession } from './host-ports/task-session';
import type { KnowledgeCaptureNativeEditSession } from './host-ports/knowledge-session';
import type { translateResultErrorMessage } from '@memoflow/http-client';

export type IAIClient = AIClientPort;
export type IWorkflowRuntimeService = WorkflowRuntimeClient;
export type ComposerDensity = 'comfortable' | 'compact' | 'icon';
interface KnowledgeSurface {
  openCreate(): Promise<KnowledgeCaptureNativeEditSession>;
  locate(): KnowledgeCaptureNativeEditSession | null;
}
/** AI renderer dependencies supplied by the application composition root. */
export interface AiUiHost {
  nativeDraftFromKnowledgeDraft: (draft: KnowledgeDraft) => KnowledgeCaptureNativeDraft;
  useGoalNativeSurface: () => GoalAIEditSurface;
  useReferenceableKnowledgeNotes: () => {
    notes: Ref<
      Array<{
        documentId: string;
        knowledgeSpaceId: string;
        title: string;
        path: string;
        updatedAt: number;
      }>
    >;
    load(options?: { query?: string; limit?: number }): Promise<void>;
    cancel(): void;
  };
  openLocalAgentNoteReview: (options: {
    content: string;
    surface: KnowledgeSurface;
    bindingId: string;
    currentBindingId(): Promise<string | null>;
    persist(
      request: ConfirmedLocalVaultWriteReq,
    ): Promise<{ note: { knowledgeDocumentId: string | null } }>;
    onSaved(documentId: string): Promise<void>;
    onError?(error: unknown): void;
  }) => Promise<void>;
  useRecentKnowledgeNotes: () => {
    notes: Ref<
      Array<{
        id: string;
        title: string;
        path: string;
        knowledgeDocumentId: string | null;
        updatedAt: number;
        source: 'projection' | 'local-vault';
      }>
    >;
    load(limit?: number): Promise<void>;
    emailVerificationRequired: Ref<boolean>;
    errorMessageKey: Ref<string | null>;
  };
  useTask: () => {
    templates: Ref<TaskPlanClientDTO[] | null>;
    fetchTemplates(query: { page: number; limit: number }): Promise<unknown>;
  };
  useGoal: () => { goals: Ref<GoalClientDTO[]>; fetchGoals(): Promise<unknown> };
  AI_CLIENT_KEY: InjectionKey<AIClientPort>;
  AI_ASSISTANT_RUNTIME_KEY: InjectionKey<AssistantRuntimeClient>;
  AI_WORKFLOW_RUNTIME_KEY: InjectionKey<WorkflowRuntimeClient>;
  AI_RUNTIME_USAGE_KEY: InjectionKey<RuntimeUsageClient>;
  AI_AGENT_REGISTRY_KEY: InjectionKey<AgentRegistryClient>;
  AI_LOCAL_AGENT_KEY: InjectionKey<LocalAgentClient>;
  AI_CONFIGURATION_REVISION_KEY: InjectionKey<Ref<number>>;
  ASSISTANT_SURFACE_KEY: InjectionKey<AIRuntimeSurface>;
  GOAL_SERVICE_KEY: InjectionKey<GoalClientPort>;
  TASK_SERVICE_KEY: InjectionKey<TaskClientPort>;
  REPOSITORY_SERVICE_KEY: InjectionKey<RepositoryClientPort>;
  SHELL_COMPOSER_DENSITY_KEY: InjectionKey<Ref<ComposerDensity>>;
  SHELL_COMPOSER_MOUNT_KEY: InjectionKey<ShallowRef<HTMLElement | null>>;
  COMPOSER_TEXTAREA_MAX_PX: number;
  useStrictInject<T>(key: InjectionKey<T>, name?: string): T;
  useServerStateIdentityScope(): () => string;
  useLabelCatalog(): {
    options: Ref<Array<{ id: string; name: string; color?: string | null }>>;
    isLoading: Ref<boolean>;
    isCreating: Ref<boolean>;
    createLabel(name: string): Promise<LabelClientDTO>;
    resolveNames(names: readonly string[]): Promise<string[]>;
  } & {
    labels: Ref<LabelClientDTO[]>;
    existingNames(
      names: readonly string[],
    ): Promise<Array<{ name: string; label: LabelClientDTO | null }>>;
  };
  useTaskNativeSurface(): {
    openCreate(): Promise<TaskNativeEditSession>;
    locate(): TaskNativeEditSession | null;
  };
  useKnowledgeNativeSurface(): KnowledgeSurface;
  useKnowledgeNativeSurfaceRegistration():
    | (KnowledgeSurface & {
        register(path: string, session: KnowledgeCaptureNativeEditSession): () => void;
      })
    | null;
  useAppShellStore(): {
    rightPanelOpen: boolean;
    panelSurface: string;
    activeTab:
      | {
          module: 'goal' | 'task' | 'note' | 'schedule' | 'routine' | 'notification';
          route: string;
          title: string;
        }
      | null
      | undefined;
    openTab(input: { module: 'goal'; route: string; title: string; intent: 'deeplink' }): unknown;
  };
  canLeaveBusinessSurface(t?: (key: string) => string, to?: RouteLocationNormalized): boolean;
  renderSafeMarkdown(source: string): string;
  semanticElevationClass(value: 'inset' | 'raised' | 'floating' | 'floating-interactive'): string;
  semanticToneStatusClass(
    value: 'primary' | 'info' | 'success' | 'warning' | 'destructive' | 'muted',
  ): string;
  translateResultError: typeof translateResultErrorMessage;
  subscribeWorkspaceEvents(
    runtime: Pick<WorkflowRuntimeClient, 'streamWorkspaceEvents'>,
    options: WorkspaceEventStreamOptions,
  ): Promise<void>;
  resetWorkspaceEvents(runtime: Pick<WorkflowRuntimeClient, 'streamWorkspaceEvents'>): void;
}
export let aiUiHost: AiUiHost;

export let AI_AGENT_REGISTRY_KEY: AiUiHost['AI_AGENT_REGISTRY_KEY'];
export let AI_ASSISTANT_RUNTIME_KEY: AiUiHost['AI_ASSISTANT_RUNTIME_KEY'];
export let AI_CLIENT_KEY: AiUiHost['AI_CLIENT_KEY'];
export let AI_CONFIGURATION_REVISION_KEY: AiUiHost['AI_CONFIGURATION_REVISION_KEY'];
export let AI_LOCAL_AGENT_KEY: AiUiHost['AI_LOCAL_AGENT_KEY'];
export let AI_RUNTIME_USAGE_KEY: AiUiHost['AI_RUNTIME_USAGE_KEY'];
export let AI_WORKFLOW_RUNTIME_KEY: AiUiHost['AI_WORKFLOW_RUNTIME_KEY'];
export let ASSISTANT_SURFACE_KEY: AiUiHost['ASSISTANT_SURFACE_KEY'];
export let COMPOSER_TEXTAREA_MAX_PX: AiUiHost['COMPOSER_TEXTAREA_MAX_PX'];
export let GOAL_SERVICE_KEY: AiUiHost['GOAL_SERVICE_KEY'];
export let REPOSITORY_SERVICE_KEY: AiUiHost['REPOSITORY_SERVICE_KEY'];
export let SHELL_COMPOSER_DENSITY_KEY: AiUiHost['SHELL_COMPOSER_DENSITY_KEY'];
export let SHELL_COMPOSER_MOUNT_KEY: AiUiHost['SHELL_COMPOSER_MOUNT_KEY'];
export let TASK_SERVICE_KEY: AiUiHost['TASK_SERVICE_KEY'];
export function bindAiUiHost(host: AiUiHost): void {
  aiUiHost = host;
  AI_AGENT_REGISTRY_KEY = host.AI_AGENT_REGISTRY_KEY;
  AI_ASSISTANT_RUNTIME_KEY = host.AI_ASSISTANT_RUNTIME_KEY;
  AI_CLIENT_KEY = host.AI_CLIENT_KEY;
  AI_CONFIGURATION_REVISION_KEY = host.AI_CONFIGURATION_REVISION_KEY;
  AI_LOCAL_AGENT_KEY = host.AI_LOCAL_AGENT_KEY;
  AI_RUNTIME_USAGE_KEY = host.AI_RUNTIME_USAGE_KEY;
  AI_WORKFLOW_RUNTIME_KEY = host.AI_WORKFLOW_RUNTIME_KEY;
  ASSISTANT_SURFACE_KEY = host.ASSISTANT_SURFACE_KEY;
  COMPOSER_TEXTAREA_MAX_PX = host.COMPOSER_TEXTAREA_MAX_PX;
  GOAL_SERVICE_KEY = host.GOAL_SERVICE_KEY;
  REPOSITORY_SERVICE_KEY = host.REPOSITORY_SERVICE_KEY;
  SHELL_COMPOSER_DENSITY_KEY = host.SHELL_COMPOSER_DENSITY_KEY;
  SHELL_COMPOSER_MOUNT_KEY = host.SHELL_COMPOSER_MOUNT_KEY;
  TASK_SERVICE_KEY = host.TASK_SERVICE_KEY;
}
