import type {
  Component,
  InjectionKey,
  MaybeRefOrGetter,
  ObjectDirective,
  Ref,
  ShallowRef,
} from 'vue';
import type { QueryClient } from '@tanstack/vue-query';
import type { TimeFacade } from '@memoflow/time';
import type { Ymd } from '@memoflow/shared-primitives';
import type { TaskClientPort } from '@memoflow/task-client';
import type { LabelClientDTO } from '@memoflow/label-contracts';
import type { Result } from '@memoflow/contracts/result';
import type {
  GetGoalAggregateRes,
  GoalClientDTO,
  GoalSystemView,
  KeyResultClientDTO,
  QueryGoalsRes,
} from '@memoflow/goal-contracts';

/** Minimal desktop auth invoke surface (mirrors app-vue DesktopAuthApi). */
export interface TaskUiDesktopAuthApi {
  invoke?: (channel: string, ...args: unknown[]) => Promise<unknown>;
}

/** Result error shape consumed by the error helpers. */
export interface TaskUiResultErrorLike {
  code?: string | null;
  message?: string;
  status?: number;
}

export type TaskUiTranslateFn = (key: string, params?: Record<string, unknown>) => string;

/** Options accepted by the task-plan cache-key canonicalizer. */
export interface TaskUiCanonicalTaskPlanListQuery {
  page: number;
  limit: number;
  status?: string[];
  goalId?: string;
  keyResultId?: string;
  labelIdsAll?: string[];
  outcome?: string[];
  archiveState?: string;
}
export type TaskUiTaskPlanListQueryInput = Partial<TaskUiCanonicalTaskPlanListQuery>;

/** Frozen query-key factories (structural mirror of platform/server-state/query-keys). */
export interface TaskUiTaskPlanQueryKeys {
  all: readonly string[];
  identity(identityScope: string): readonly unknown[];
  lists(identityScope: string): readonly unknown[];
  list(identityScope: string, query: TaskUiCanonicalTaskPlanListQuery): readonly unknown[];
  details(identityScope: string): readonly unknown[];
  detail(identityScope: string, id: string): readonly unknown[];
  workspace(identityScope: string, id: string, recentLimit?: number): readonly unknown[];
}
export interface TaskUiTaskOccurrenceQueryKeys {
  all: readonly string[];
  identity(identityScope: string): readonly unknown[];
  detail(identityScope: string, id: string): readonly unknown[];
  ranges(identityScope: string): readonly unknown[];
  range(
    identityScope: string,
    start: number,
    end: number,
    includeOverdueOpen?: boolean,
  ): readonly unknown[];
}

/** Renderer-owned server-state runtime. */
export interface TaskUiServerStateRuntime {
  queryClient: QueryClient;
  dispose(): void;
  clearIdentity(identityScope: string): void;
}

export interface TaskUiLabelOption {
  readonly id: string;
  readonly name: string;
  readonly color?: string | null;
}

export interface TaskUiMenuAction {
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

export interface TaskUiDialogDraftStore {
  scope: Ref<string | null> | null;
  load<T>(key: string): T | null;
  save<T>(key: string, value: T): void;
  clear(key: string): void;
}

export type TaskUiPanelSurfaceStatus = 'clean' | 'dirty' | 'busy';

/**
 * Task-native edit session surface. The concrete session shape lives with the
 * Task module; the shell only tracks placement by full route path.
 */
export interface TaskUiNativeSurfaceHost<Session> {
  openCreate(): Promise<Session>;
  locate(): Session | null;
  register(fullPath: string, session: Session): () => void;
}

/**
 * Goal-binding read port (裁决二). The goal-ui public surface exposes no
 * GoalBindingOptionProvider, so the Task renderer owns this DTO-shaped port;
 * app-vue implements it by injecting the real Goal service.
 */
export interface TaskUiGoalBindingPort {
  listGoals(params?: {
    page?: number;
    pageSize?: number;
    query?: string;
    status?: string[];
    systemView?: GoalSystemView;
    labelIdsAll?: string[];
  }): Promise<Result<{ goals: GoalClientDTO[]; pagination: QueryGoalsRes['pagination'] }>>;
  getGoalAggregateView(id: string): Promise<Result<GetGoalAggregateRes>>;
  getGoal(id: string): Promise<Result<GoalClientDTO>>;
  getKeyResults(goalId: string): Promise<Result<{ keyResults: KeyResultClientDTO[] }>>;
}

export interface TaskUiKeyResultCalculationPresentation {
  labelKey: string;
  recordInputKind: string;
  recordPromptLabelKey: string;
}

/** Renderer composition dependencies for the Task surfaces. */
export interface TaskUiHost {
  // ---- DI keys ----
  TASK_SERVICE_KEY: InjectionKey<TaskClientPort>;
  GOAL_SERVICE_KEY: InjectionKey<TaskUiGoalBindingPort>;
  DESKTOP_AUTH_API_KEY: InjectionKey<TaskUiDesktopAuthApi | undefined>;

  // ---- server-state runtime & keys ----
  SERVER_STATE_RUNTIME_KEY: InjectionKey<TaskUiServerStateRuntime>;
  SERVER_STATE_IDENTITY_SCOPE_KEY: InjectionKey<ShallowRef<string> | Ref<string>>;
  useServerStateRuntime(): TaskUiServerStateRuntime;
  useServerStateIdentityScope(): () => string;
  createTestServerStateRuntime(): TaskUiServerStateRuntime;
  taskPlanQueryKeys: TaskUiTaskPlanQueryKeys;
  taskOccurrenceQueryKeys: TaskUiTaskOccurrenceQueryKeys;
  canonicalizeTaskPlanListQuery(
    query?: TaskUiTaskPlanListQueryInput,
  ): TaskUiCanonicalTaskPlanListQuery;
  TASK_TEMPLATE_STALE_TIME_MS: number;
  TASK_OCCURRENCE_STALE_TIME_MS: number;

  // ---- DI & error helpers ----
  useStrictInject<T>(key: InjectionKey<T>, name?: string): T;
  sanitizeForIpc<T>(value: T): T;
  createComposableHandleError(options: {
    t: TaskUiTranslateFn;
    setError(message: string | null): void;
    report?(message: string): void;
  }): (error: unknown, fallbackKey: string) => void;
  executeDesktopAuthenticatedResult<T>(options: {
    operation: () => Promise<Result<T>>;
    logScope: string;
    t?: TaskUiTranslateFn;
    fallbackKey?: string;
    desktopApi?: TaskUiDesktopAuthApi;
    onStart?: () => void | Promise<void>;
    onSuccess?: (data: T) => void | Promise<void>;
    onError?: (error: TaskUiResultErrorLike, translatedMessage: string) => void | Promise<void>;
    onFinally?: () => void | Promise<void>;
  }): Promise<Result<T>>;

  // ---- shell / dialog / i18n ----
  useDialogCloseGuard(options: {
    dirty: MaybeRefOrGetter<boolean>;
    busy?: MaybeRefOrGetter<boolean>;
    onClose(): void | Promise<void>;
  }): { confirming: Ref<boolean>; requestClose(): Promise<boolean> };
  useDialogDraftStore(): TaskUiDialogDraftStore;
  clearDialogDrafts(): void;
  useLabelCatalog(): {
    options: Ref<TaskUiLabelOption[]>;
    labels: Ref<LabelClientDTO[]>;
    isLoading: Ref<boolean>;
    isCreating: Ref<boolean>;
    createLabel(name: string): Promise<LabelClientDTO>;
    resolveNames(names: readonly string[]): Promise<string[]>;
  };
  getI18nGlobal(): { t(key: string, ...args: unknown[]): unknown };

  // ---- surface status & native registration ----
  usePanelSurfaceStatus(status: Ref<TaskUiPanelSurfaceStatus>): void;
  useTaskNativeSurfaceRegistration<Session>(): TaskUiNativeSurfaceHost<Session> | null;

  // ---- select / calendar / keyboard ----
  normalizeSelectString(value: unknown): string | null;
  handleCalendarSelect(date: unknown, setter: (value: string) => void): void;
  vKeyboardList: ObjectDirective<HTMLElement>;

  // ---- product time ----
  getProductTime(): TimeFacade;
  getProductTodayYmd(): Ymd;
  productTimeRevision: Ref<number>;
  formatProductDate(value: number | string | Date | null | undefined, empty?: string): string;
  formatProductDateTime(value: number | string | Date | null | undefined, empty?: string): string;
  formatProductYmd(value: Ymd | null | undefined, empty?: string): string;
  startOfDayMs(ms: number): number;
  endOfDayMs(ms: number): number;
  isSameDayMs(a: number, b: number): boolean;
  isTodayMs(ms: number): boolean;

  // ---- goal binding port (裁决二) ----
  getKeyResultCalculationLabel(method: string, t?: TaskUiTranslateFn): string;
  getKeyResultRecordPromptLabel(method: string, t?: TaskUiTranslateFn): string;
  KEY_RESULT_CALCULATION_PRESENTATION: Record<string, TaskUiKeyResultCalculationPresentation>;

  // ---- shared components ----
  components: Record<
    | 'ActionableWrapper'
    | 'AppEmptyState'
    | 'CapsulePreviewFooter'
    | 'CapsulePreviewHeader'
    | 'CapsulePreviewShell'
    | 'CapsulePreviewState'
    | 'GoalRecordComposerSurface'
    | 'LabelCommandPanel'
    | 'LabelFilterPopover'
    | 'LabelPicker'
    | 'ModuleHeader'
    | 'ProductAutoTextarea'
    | 'ProductDatePicker'
    | 'ProductDateTimePicker'
    | 'ProductDialogShell'
    | 'ProductEditorFrame'
    | 'ProductEntityIdentity'
    | 'ProductInlineValidation'
    | 'ProductMetadataRow'
    | 'ProductMoreProperties'
    | 'ProductPropertyChip'
    | 'ProductSingleSelectFilter'
    | 'ProductSurfaceHeader'
    | 'ResponsivePrimaryAction',
    Component
  >;
}

// Bind capabilities once in the renderer's composition root. This holds no user
// state: the functions still consult the host's existing DI, cache, i18n and time owners.
export let taskUiHost: TaskUiHost;
export function bindTaskUiHost(host: TaskUiHost): void {
  taskUiHost = host;
}
