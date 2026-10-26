/**
 * Residual 973: createComposableHandleError sole factory.
 */
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ScheduleClientPort } from '@memoflow/schedule-client';
import { useScheduleStore } from '../stores/schedule-store';
import { scheduleUiHost } from '../schedule-ui-host';

export interface ScheduleContext {
  store: ReturnType<typeof useScheduleStore>;
  service: ScheduleClientPort;
  t: ReturnType<typeof useI18n>['t'];
  savingId: ReturnType<typeof ref<string | null>>;
  handleError: (error: unknown, fallbackKey: string) => void;
}

export function createScheduleContext(): ScheduleContext {
  const service = scheduleUiHost.useStrictInject(
    scheduleUiHost.SCHEDULE_SERVICE_KEY,
    'ScheduleService',
  );
  const { t } = useI18n();
  const store = useScheduleStore();
  const savingId = ref<string | null>(null);

  const handleError = scheduleUiHost.createComposableHandleError({
    t,
    setError: (message) => store.setError(message),
  });

  return {
    store,
    service,
    t,
    savingId,
    handleError,
  };
}
