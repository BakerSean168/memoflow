import type { Component, InjectionKey, MaybeRefOrGetter, ObjectDirective, Ref } from 'vue';
import type { QueryClient } from '@tanstack/vue-query';
import type { RoutineClientPort } from '@memoflow/routine-client';
import type { TimeFacade } from '@memoflow/time';
import type { Ymd } from '@memoflow/shared-primitives';
import type { translateResultErrorMessage } from '@memoflow/http-client';

/** Renderer capabilities supplied by the application's composition root. */
export interface RoutineUiHost {
  ROUTINE_SERVICE_KEY: InjectionKey<RoutineClientPort>;
  components: Record<'AppEmptyState' | 'CapsulePreviewFooter' | 'CapsulePreviewHeader' | 'CapsulePreviewShell' | 'CapsulePreviewState' | 'ModuleHeader' | 'ProductAutoTextarea' | 'ProductDatePicker' | 'ProductEditorFrame' | 'ProductInlineValidation' | 'ProductPopoverSurface' | 'ProductPropertyChip' | 'ProductSingleSelectFilter' | 'ProductTimePicker' | 'ProductTimeZoneSelector', Component>;
  vKeyboardList: ObjectDirective<HTMLElement>;
  useStrictInject<T>(key: InjectionKey<T>, name?: string): T;
  translateResultError: typeof translateResultErrorMessage;
  useTransientFeedback(durationMs?: number): { visible: Ref<boolean>; show(): void; hide(): void };
  useDialogCloseGuard(options: {
    dirty: MaybeRefOrGetter<boolean>;
    busy?: MaybeRefOrGetter<boolean>;
    onClose(): void | Promise<void>;
  }): { confirming: Ref<boolean>; requestClose(): Promise<boolean> };
  usePanelSurfaceStatus(status: Ref<'clean' | 'dirty' | 'busy'>): void;
  useServerStateRuntime(): { queryClient: QueryClient };
  useServerStateIdentityScope(): () => string;
  routineUpcomingQueryKeys: {
    range(identityScope: string, start: number, end: number, limit: number): readonly unknown[];
  };
  ROUTINE_UPCOMING_STALE_TIME_MS: number;
  getProductTime(): TimeFacade;
  getProductTodayYmd(): Ymd;
  productTimeRevision: Ref<number>;
  formatProductHm(value: number | string | Date | null | undefined, empty?: string | { display?: string; unknown?: string }): string;
  startOfDayMs(value: number): number;
  endOfDayMs(value: number): number;
}

export let routineUiHost: RoutineUiHost;
export function bindRoutineUiHost(host: RoutineUiHost): void {
  routineUiHost = host;
}
