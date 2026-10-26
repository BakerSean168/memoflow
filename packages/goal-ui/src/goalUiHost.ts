import type { Component, InjectionKey, Ref, ObjectDirective, MaybeRefOrGetter } from 'vue';
import type { QueryClient } from '@tanstack/vue-query';
import type { TimeFacade } from '@memoflow/time';
import type { Ymd } from '@memoflow/shared-primitives';
import type { GoalClientPort } from '@memoflow/goal-client';
import type { LabelClientDTO } from '@memoflow/label-contracts';
import type { Result } from '@memoflow/transport-contracts';
import type {
  GoalKnowledgeLinkReq,
  GoalKnowledgeListReq,
  GoalKnowledgeRelation,
} from '@memoflow/contracts/relation';
import type {
  AIWorkflowRunView,
  AIWorkflowGetClientRequest,
  WorkspaceEvent,
} from '@memoflow/contracts/ai';

export interface GoalWorkspaceEventStreamOptions {
  cursor?: string;
  signal: AbortSignal;
  onEvent(event: WorkspaceEvent): void | Promise<void>;
}
export interface GoalWorkflowReadPort {
  get(request: AIWorkflowGetClientRequest): Promise<AIWorkflowRunView | null>;
  streamWorkspaceEvents?(options: GoalWorkspaceEventStreamOptions): Promise<void>;
}
export interface GoalKnowledgePort {
  linkGoalKnowledge(request: GoalKnowledgeLinkReq): Promise<Result<GoalKnowledgeRelation>>;
  unlinkGoalKnowledge(request: GoalKnowledgeLinkReq): Promise<Result<{ unlinked: boolean }>>;
  listGoalKnowledge(request: GoalKnowledgeListReq): Promise<Result<GoalKnowledgeRelation[]>>;
}
import type { ResultErrorTranslateFn, translateResultErrorMessage } from '@memoflow/http-client';
import type { GoalDraftCheckpointStore } from './infrastructure/goal-draft-checkpoint.indexeddb';

export interface GoalLabelOption {
  readonly id: string;
  readonly name: string;
  readonly color?: string | null;
}
export interface GoalMenuAction {
  key: string;
  testId?: string;
  label: string;
  icon?: Component;
  shortcut?: string;
  destructive?: boolean;
  disabled?: boolean;
  separator?: boolean;
  handler: () => void;
}

type DateValue = number | string | Date | null | undefined;
type EmptyLabel = string | { display?: string; unknown?: string };

/** Renderer composition dependencies. The host retains DI, cache, locale and platform ownership. */
export interface GoalUiHost {
  GOAL_SERVICE_KEY: InjectionKey<GoalClientPort>;
  GOAL_DRAFT_CHECKPOINT_KEY: InjectionKey<GoalDraftCheckpointStore>;
  GOAL_KNOWLEDGE_SERVICE_KEY: InjectionKey<GoalKnowledgePort>;
  AI_WORKFLOW_RUNTIME_KEY: InjectionKey<GoalWorkflowReadPort>;
  components: Record<
    | 'ActionableWrapper'
    | 'AppEmptyState'
    | 'ModuleHeader'
    | 'LabelCommandPanel'
    | 'ProductAutoTextarea'
    | 'ProductDateTimePicker'
    | 'ProductEntityIdentity'
    | 'ProductMetadataRow'
    | 'ProductMoreProperties'
    | 'ProductPropertyChip'
    | 'ProductPopoverSurface'
    | 'ProductTimeframePicker'
    | 'LabelFilterPopover'
    | 'ProductSingleSelectFilter'
    | 'ProductSurfaceHeader'
    | 'ResponsivePrimaryAction'
    | 'ProductDialogShell'
    | 'PaneScopedDialog'
    | 'LabelPicker'
    | 'ProductInlineValidation',
    Component
  >;
  vKeyboardList: ObjectDirective<HTMLElement>;
  useStrictInject<T>(key: InjectionKey<T>, name?: string): T;
  sanitizeForIpc<T>(value: T): T;
  translateResultError: typeof translateResultErrorMessage;
  createComposableHandleError(options: {
    t: ResultErrorTranslateFn;
    setError(message: string | null): void;
    report?(message: string): void;
  }): (error: unknown, fallbackKey: string) => void;
  useTransientFeedback(durationMs?: number): { visible: Ref<boolean>; show(): void; hide(): void };
  useDialogCloseGuard(options: {
    dirty: MaybeRefOrGetter<boolean>;
    busy?: MaybeRefOrGetter<boolean>;
    onClose(): void | Promise<void>;
  }): { confirming: Ref<boolean>; requestClose(): Promise<boolean> };
  useLabelCatalog(): {
    options: Ref<GoalLabelOption[]>;
    isLoading: Ref<boolean>;
    isCreating: Ref<boolean>;
    createLabel(name: string): Promise<LabelClientDTO>;
    resolveNames(names: readonly string[]): Promise<string[]>;
  };
  useReferenceableKnowledgeNotes(): {
    notes: Ref<Array<{ documentId: string; knowledgeSpaceId: string; title: string }>>;
    isLoading: Ref<boolean>;
    error: Ref<string | null>;
    load(options?: { query?: string; limit?: number }): Promise<void>;
    cancel(): void;
  };
  useServerStateRuntime(): { queryClient: QueryClient };
  useServerStateIdentityScope(): () => string;
  goalHomeQueryKeys: { summary(identityScope: string): readonly string[] };
  GOAL_HOME_STALE_TIME_MS: number;
  subscribeWorkspaceEvents(
    runtime: GoalWorkflowReadPort,
    options: GoalWorkspaceEventStreamOptions,
  ): Promise<void>;
  getI18nGlobal(): { t(key: string): string };
  getProductTime(): TimeFacade;
  getProductTodayYmd(): Ymd;
  productTimeRevision: Ref<number>;
  formatProductDate(value: DateValue, empty?: EmptyLabel): string;
  formatProductDateTime(value: DateValue, empty?: EmptyLabel): string;
  formatProductYmd(value: Ymd | null | undefined, empty?: EmptyLabel): string;
  formatProductPattern(value: DateValue, pattern: string, empty?: EmptyLabel): string;
  formatProductRelative(value: number | null | undefined, empty?: EmptyLabel): string;
}

// Bind capabilities once in the renderer's composition root. This contains no user
// state: the functions still consult the host's existing DI, i18n and time owners.
export let goalUiHost: GoalUiHost;
export function bindGoalUiHost(host: GoalUiHost): void {
  goalUiHost = host;
}
