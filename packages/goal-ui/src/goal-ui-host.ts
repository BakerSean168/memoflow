import type { Component, InjectionKey, Ref } from 'vue';
import type { Ymd } from '@memoflow/shared-primitives';
import type { GoalClientPort } from '@memoflow/goal-client';
import type { LabelClientDTO } from '@memoflow/label-contracts';
import type { GoalKnowledgeClientPort } from '@memoflow/relation-contracts';
import type { PlatformLabelOption, PlatformRendererHost } from '@memoflow/ui-host-contracts';
import type {
  AIWorkflowRunView,
  AIWorkflowGetClientRequest,
  WorkspaceEvent,
} from '@memoflow/ai-contracts';

export interface GoalWorkspaceEventStreamOptions {
  cursor?: string;
  signal: AbortSignal;
  onEvent(event: WorkspaceEvent): void | Promise<void>;
}
export interface GoalWorkflowReadPort {
  get(request: AIWorkflowGetClientRequest): Promise<AIWorkflowRunView | null>;
  streamWorkspaceEvents?(options: GoalWorkspaceEventStreamOptions): Promise<void>;
}
/**
 * Goal surfaces only manage links for one Goal; the reverse (knowledge→goals)
 * lookup stays out of this surface.
 * Goal 界面只管理单个 Goal 的关联，知识→Goal 的反查不进入该表面。
 */
export type GoalKnowledgePort = Pick<
  GoalKnowledgeClientPort,
  'linkGoalKnowledge' | 'unlinkGoalKnowledge' | 'listGoalKnowledge'
>;
import type { GoalDraftCheckpointStore } from './infrastructure/goal-draft-checkpoint.indexeddb';

/** Label option projection; single declaration lives in the platform contract. */
export type GoalLabelOption = PlatformLabelOption;
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

/**
 * Renderer composition dependencies. The host retains DI, cache, locale and
 * platform ownership; platform-level capabilities come from
 * {@link PlatformRendererHost} and only Goal slots remain here.
 */
export interface GoalUiHost extends PlatformRendererHost {
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
  useTransientFeedback(durationMs?: number): { visible: Ref<boolean>; show(): void; hide(): void };
  useReferenceableKnowledgeNotes(): {
    notes: Ref<Array<{ documentId: string; knowledgeSpaceId: string; title: string }>>;
    isLoading: Ref<boolean>;
    error: Ref<string | null>;
    load(options?: { query?: string; limit?: number }): Promise<void>;
    cancel(): void;
  };
  goalHomeQueryKeys: { summary(identityScope: string): readonly string[] };
  GOAL_HOME_STALE_TIME_MS: number;
  subscribeWorkspaceEvents(
    runtime: GoalWorkflowReadPort,
    options: GoalWorkspaceEventStreamOptions,
  ): Promise<void>;
  getProductTodayYmd(): Ymd;
  formatProductDate(value: DateValue, empty?: EmptyLabel): string;
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
