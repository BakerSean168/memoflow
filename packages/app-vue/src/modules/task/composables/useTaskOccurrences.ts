/**
 * Residual 975: createComposableHandleError toast report path.
 */
import { inject } from 'vue';
import { toast } from 'vue-sonner';
import { useI18n } from 'vue-i18n';
import { useTaskStore } from '../stores/task-store';
import { TASK_SERVICE_KEY, DESKTOP_AUTH_API_KEY } from '../../../di/keys';
import { useStrictInject } from '../../../shared/utils/useStrictInject';
import { sanitizeForIpc } from '../../../shared/utils/ipc';
import type {
  CompleteTaskOccurrenceReq,
  RescheduleTaskInput,
  SetTaskOccurrenceChecklistItemReq,
  TaskPlanClientDTO,
} from '@memoflow/contracts/task';
import type { Result } from '@memoflow/contracts/result';
import { createComposableHandleError } from '../../../shared/utils/create-composable-handle-error';
import { executeDesktopAuthenticatedResult } from '../../../shared/utils/execute-desktop-authenticated-result';
import { useServerStateIdentityScope, useServerStateRuntime } from '../../../platform/server-state';
import { patchTaskPlanEverywhere } from './taskPlanCache';

type TaskOccurrenceDTO = ReturnType<typeof useTaskStore>['instances'][number];
type TaskOccurrenceEntityLike = { toDTO(): TaskOccurrenceDTO };
type TaskPlanEntityLike = { toDTO(): TaskPlanClientDTO };

export function useTaskOccurrences() {
  const service = useStrictInject(TASK_SERVICE_KEY, 'TaskService');
  const desktopApi = inject(DESKTOP_AUTH_API_KEY, undefined);
  const store = useTaskStore();
  const runtime = useServerStateRuntime();
  const resolveIdentityScope = useServerStateIdentityScope();
  const { t } = useI18n();

  const handleError = createComposableHandleError({
    t,
    setError: (message) => store.setError(message),
    report: (message) => {
      toast.error(t('task.error.operationFailed'), { description: message });
    },
  });

  async function executeTaskOperation<T>(
    operation: () => Promise<Result<T>>,
    fallbackKey: string,
  ): Promise<Result<T>> {
    return executeDesktopAuthenticatedResult({
      operation,
      logScope: 'Task',
      t,
      fallbackKey,
      desktopApi,
      onError: (error) => {
        handleError(error, fallbackKey);
      },
    });
  }

  async function refreshTemplateProjection(templateId: string): Promise<void> {
    const result = await executeTaskOperation(
      () => service.getPlan(templateId),
      'task.error.loadTemplatesFailed',
    );
    if (result.ok) {
      // 模板投影现在属于 Query Cache authority；instance mutation 仍以本地 patch 收敛。
      patchTaskPlanEverywhere(
        runtime.queryClient,
        resolveIdentityScope(),
        (result.data as TaskPlanEntityLike).toDTO(),
      );
    }
  }

  async function updateInstanceProjection(
    entity: TaskOccurrenceEntityLike,
  ): Promise<TaskOccurrenceDTO> {
    const dto = entity.toDTO();
    store.updateInstance(dto);
    await refreshTemplateProjection(String(dto.planId));
    return dto;
  }

  async function fetchInstances(query?: Record<string, unknown>) {
    store.setLoading(true);
    store.setError(null);
    try {
      const payload = sanitizeForIpc(query) as Parameters<typeof service.listOccurrences>[0];
      const result = await executeTaskOperation(
        () => service.listOccurrences(payload),
        'task.error.loadInstancesFailed',
      );

      if (result.ok) {
        store.setInstances(
          (result.data ?? []).map((instance) => (instance as TaskOccurrenceEntityLike).toDTO()),
        );
      }
    } finally {
      store.setLoading(false);
    }
  }

  async function fetchInstancesByDateRange(startDate: number, endDate: number) {
    store.setLoading(true);
    store.setError(null);
    try {
      const result = await executeTaskOperation(
        () => service.listOccurrencesByDateRange(startDate, endDate),
        'task.error.loadInstancesFailed',
      );

      if (result.ok) {
        store.setInstances(
          (result.data ?? []).map((instance) => (instance as TaskOccurrenceEntityLike).toDTO()),
        );
      }
    } finally {
      store.setLoading(false);
    }
  }

  async function startOccurrence(id: string) {
    const result = await executeTaskOperation(
      () => service.startOccurrence(id),
      'task.error.startFailed',
    );
    if (result.ok) {
      return updateInstanceProjection(result.data);
    }
    return null;
  }

  async function completeOccurrence(id: string, request?: CompleteTaskOccurrenceReq) {
    const result = await executeTaskOperation(
      () => service.completeOccurrence(id, sanitizeForIpc(request)),
      'task.error.completeFailed',
    );
    if (result.ok) {
      const dto = await updateInstanceProjection(result.data);
      toast.success(t('task.error.completeSuccess'));
      return dto;
    }
    return null;
  }

  async function uncompleteOccurrence(id: string) {
    const result = await executeTaskOperation(
      () => service.uncompleteOccurrence(id),
      'task.error.uncompleteFailed',
    );
    if (result.ok) {
      const dto = await updateInstanceProjection(result.data);
      toast.success(t('task.error.uncompleteSuccess'));
      return dto;
    }
    return null;
  }

  async function markOccurrenceMissed(id: string) {
    const result = await executeTaskOperation(
      () => service.markOccurrenceMissed(id),
      'task.error.markMissedFailed',
    );
    if (result.ok) {
      const dto = await updateInstanceProjection(result.data);
      toast.success(t('task.error.markMissedSuccess'));
      return dto;
    }
    return null;
  }

  async function rescheduleOccurrence(id: string, request: RescheduleTaskInput) {
    const result = await executeTaskOperation(
      () => service.rescheduleOccurrence(id, sanitizeForIpc(request) as RescheduleTaskInput),
      'task.error.operationFailed',
    );
    if (result.ok) {
      await updateInstanceProjection(result.data);
    }
    return result;
  }

  async function setOccurrenceChecklistItem(id: string, request: SetTaskOccurrenceChecklistItemReq) {
    const result = await executeTaskOperation(
      () =>
        service.setOccurrenceChecklistItem(id, sanitizeForIpc(request) as SetTaskOccurrenceChecklistItemReq),
      'task.error.operationFailed',
    );
    if (result.ok) {
      return updateInstanceProjection(result.data);
    }
    return null;
  }

  async function skipOccurrence(id: string) {
    const result = await executeTaskOperation(
      () => service.skipOccurrence(id),
      'task.error.skipFailed',
    );
    if (result.ok) {
      const dto = await updateInstanceProjection(result.data);
      toast.success(t('task.error.skipSuccess'));
      return dto;
    }
    return null;
  }

  return {
    fetchInstances,
    fetchInstancesByDateRange,
    startOccurrence,
    completeOccurrence,
    uncompleteOccurrence,
    markOccurrenceMissed,
    rescheduleOccurrence,
    setOccurrenceChecklistItem,
    skipOccurrence,
  };
}
