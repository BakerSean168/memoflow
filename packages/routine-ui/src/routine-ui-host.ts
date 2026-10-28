import type { Component, InjectionKey, Ref } from 'vue';
import type { RoutineClientPort } from '@memoflow/routine-client';
import type { Ymd } from '@memoflow/shared-primitives';
import type { PlatformRendererHost } from '@memoflow/ui-host-contracts';

/**
 * Renderer composition dependencies. Platform capabilities come from
 * {@link PlatformRendererHost}; this port only declares the Routine slots.
 */
export interface RoutineUiHost extends PlatformRendererHost {
  ROUTINE_SERVICE_KEY: InjectionKey<RoutineClientPort>;
  components: Record<
    | 'AppEmptyState'
    | 'CapsulePreviewFooter'
    | 'CapsulePreviewHeader'
    | 'CapsulePreviewShell'
    | 'CapsulePreviewState'
    | 'ModuleHeader'
    | 'ProductAutoTextarea'
    | 'ProductDatePicker'
    | 'ProductEditorFrame'
    | 'ProductInlineValidation'
    | 'ProductPopoverSurface'
    | 'ProductPropertyChip'
    | 'ProductSingleSelectFilter'
    | 'ProductTimePicker'
    | 'ProductTimeZoneSelector',
    Component
  >;
  useTransientFeedback(durationMs?: number): { visible: Ref<boolean>; show(): void; hide(): void };
  routineUpcomingQueryKeys: {
    range(identityScope: string, start: number, end: number, limit: number): readonly unknown[];
  };
  ROUTINE_UPCOMING_STALE_TIME_MS: number;
  getProductTodayYmd(): Ymd;
  formatProductHm(
    value: number | string | Date | null | undefined,
    empty?: string | { display?: string; unknown?: string },
  ): string;
  startOfDayMs(value: number): number;
  endOfDayMs(value: number): number;
}

export let routineUiHost: RoutineUiHost;
export function bindRoutineUiHost(host: RoutineUiHost): void {
  routineUiHost = host;
}
