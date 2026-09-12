/**
 * useTaskPlanMutations — Task template server-state mutations (pilot authority, §3.4).
 *
 * - create / single delete / batch delete：**server-confirmed**（不伪造临时 id、不猜测多
 *   projection；batch 保持逐项、首错停止、已成功项不回滚的 API 语义）；
 * - update / activate / pause / archive：**optimistic pilot** —— cancel 受影响的 queries、
 *   snapshot 全部匹配 list/detail/graph entries、按 id patch；任一 failure exact restore
 *   快照；onSettled 一律经 dispatcher invalidate（组件不再手动 refresh）。
 *
 * 所有 service 调用继续走 `executeDesktopAuthenticatedResult`（Desktop auth recovery），
 * 网络失败经 runtime `networkMode: 'always'` + `retry:0` 立即进入 onError/rollback。
 */
import { computed, inject } from 'vue';
import { useMutation } from '@tanstack/vue-query';
import { useI18n } from 'vue-i18n';
import { toast } from 'vue-sonner';
import { unwrap, type Result } from '@memoflow/contracts/result';
import type {
  CreateTaskPlanReq,
  TaskPlanClientDTO,
  UpdateTaskPlanReq,
} from '@memoflow/contracts/task';
import { useStrictInject } from '../../../shared/utils/useStrictInject';
import { TASK_SERVICE_KEY, DESKTOP_AUTH_API_KEY } from '../../../di/keys';
import { useServerStateIdentityScope, useServerStateRuntime } from '../../../platform/server-state';
import { createComposableHandleError } from '../../../shared/utils/create-composable-handle-error';
import { executeDesktopAuthenticatedResult } from '../../../shared/utils/execute-desktop-authenticated-result';
import { sanitizeForIpc } from '../../../shared/utils/ipc';
import {
  getTaskPlanFromCache,
  mergeTaskPlanUpdate,
  patchTaskPlanEverywhere,
  removeTaskPlanFromCache,
  restoreTaskPlanSnapshot,
  snapshotTaskPlanCache,
} from './taskPlanCache';
import { taskPlanQueryKeys } from '../../../platform/server-state/query-keys';

/** Feedback intent for create (plan §2.2: preserve instanceCount/todayInstanceCreated feedback). */
export type CreateTemplateFeedbackIntent = 'plan' | 'quick';

/**
 * Create the Task template mutation set (create/update/delete/batch/activate/pause/archive).
 * 创建任务模板 mutation 集合。
 */
export function useTaskPlanMutations() {
  const service = useStrictInject(TASK_SERVICE_KEY, 'TaskService');
  const desktopApi = inject(DESKTOP_AUTH_API_KEY, undefined);
  const runtime = useServerStateRuntime();
  const resolveIdentityScope = useServerStateIdentityScope();
  const { t } = useI18n();

  const handleError = createComposableHandleError({
    t,
    setError: () => {},
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

  function createFeedbackKey(
    feedbackIntent: CreateTemplateFeedbackIntent,
    todayInstanceCreated: boolean,
  ): string {
    if (feedbackIntent === 'quick') {
      return todayInstanceCreated
        ? 'task.error.createQuickTaskWithTodayInstanceSuccess'
        : 'task.error.createQuickTaskWithoutTodayInstanceSuccess';
    }
    return todayInstanceCreated
      ? 'task.error.createTemplateWithTodayInstanceSuccess'
      : 'task.error.createTemplateWithoutTodayInstanceSuccess';
  }

  const createTemplate = useMutation({
    mutationFn: async ({
      req,
    }: {
      req: CreateTaskPlanReq;
      feedbackIntent?: CreateTemplateFeedbackIntent;
    }) => {
      const result = await executeTaskOperation(
        () => service.createTemplate(sanitizeForIpc(req)),
        'task.error.createFailed',
      );
      return unwrap(result);
    },
    onMutate: () => ({ identityScope: resolveIdentityScope() }),
    onSuccess: (data, _vars, context) => {
      // Seed the detail key from the server response (plan §3.4).
      // 用 server 返回的 template seed detail key（§3.4）。
      patchTaskPlanEverywhere(
        runtime.queryClient,
        context!.identityScope,
        data.template.toDTO(),
      );
      toast.success(
        t(createFeedbackKey(_vars.feedbackIntent ?? 'plan', data.todayInstanceCreated), {
          count: data.instanceCount,
        }),
      );
    },
    onSettled: (_data, _error, _vars, context) => {
      void runtime.dispatcher.invalidate({
        target: 'task-plan',
        identityScope: context!.identityScope,
        source: 'mutation',
      });
    },
  });

  const updateTemplate = useMutation({
    mutationFn: async ({ id, req }: { id: string; req: UpdateTaskPlanReq }) => {
      const result = await executeTaskOperation(
        () => service.updateTemplate(id, sanitizeForIpc(req)),
        'task.error.updateFailed',
      );
      return unwrap(result);
    },
    onMutate: async ({ id, req }) => {
      const identityScope = resolveIdentityScope();
      await runtime.queryClient.cancelQueries({
        queryKey: ['server-state', 'task-plan', identityScope],
      });
      const snapshot = snapshotTaskPlanCache(runtime.queryClient, identityScope);
      const optimistic = mergeTaskPlanUpdate(runtime.queryClient, identityScope, id, req);
      if (optimistic) {
        patchTaskPlanEverywhere(runtime.queryClient, identityScope, optimistic);
      }
      return { snapshot, identityScope };
    },
    onError: (_error, _vars, context) => {
      if (context?.snapshot) {
        restoreTaskPlanSnapshot(runtime.queryClient, context!.identityScope, context.snapshot);
      }
    },
    onSuccess: (dto, _vars, context) => {
      patchTaskPlanEverywhere(runtime.queryClient, context!.identityScope, dto.toDTO());
      toast.success(t('task.error.updateSuccess'));
    },
    onSettled: (_data, _error, vars, context) => {
      void runtime.dispatcher.invalidate({
        target: 'task-plan',
        identityScope: context!.identityScope,
        source: 'mutation',
        entityId: vars.id,
      });
    },
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      const result = await executeTaskOperation(
        () => service.deleteTemplate(id),
        'task.error.deleteFailed',
      );
      unwrap(result);
      return id;
    },
    onMutate: () => ({ identityScope: resolveIdentityScope() }),
    onSuccess: (id, _vars, context) => {
      removeTaskPlanFromCache(runtime.queryClient, context!.identityScope, id);
      toast.success(t('task.error.deleteSuccess'));
    },
    onSettled: (_data, _error, id, context) => {
      void runtime.dispatcher.invalidate({
        target: 'task-plan',
        identityScope: context!.identityScope,
        source: 'mutation',
        entityId: id,
      });
    },
  });

  // P1-2: batch delete captures identityScope per invocation at mutation begin — the wrapper
  // resolves it into the variables — and mutationFn/onSettled read only that invocation's own
  // variables. No shared state, so concurrent batches with different identities cannot overwrite
  // each other's scope between begin and execution; execution never re-resolves the scope.
  const deleteTemplates = useMutation({
    mutationFn: async ({
      ids,
      identityScope,
    }: {
      ids: readonly string[];
      identityScope: string;
    }) => {
      let deleted = 0;
      for (const id of ids) {
        const result = await executeTaskOperation(
          () => service.deleteTemplate(id),
          'task.error.deleteFailed',
        );
        unwrap(result); // first failure stops the batch (partial success preserved)
        removeTaskPlanFromCache(runtime.queryClient, identityScope, id);
        deleted++;
      }
      return deleted;
    },
    onMutate: ({ identityScope }) => ({ identityScope }),
    onSettled: (_data, _error, _ids, context) => {
      void runtime.dispatcher.invalidate({
        target: 'task-plan',
        identityScope: context!.identityScope,
        source: 'mutation',
      });
    },
  });

  function createStatusMutation(
    operation: (id: string) => Promise<Result<{ toDTO(): TaskPlanClientDTO }>>,
    fallbackKey: string,
    successKey: string,
    optimisticStatus: TaskPlanClientDTO['status'],
  ) {
    return useMutation({
      mutationFn: async (id: string) => {
        const result = await executeTaskOperation(() => operation(id), fallbackKey);
        return unwrap(result);
      },
      onMutate: async (id) => {
        const identityScope = resolveIdentityScope();
        await runtime.queryClient.cancelQueries({
          queryKey: taskPlanQueryKeys.identity(identityScope),
        });
        const snapshot = snapshotTaskPlanCache(runtime.queryClient, identityScope);
        // Derive the status patch from a complete cached projection; never a bare {id,status}.
        // 用完整缓存投影派生 status patch，绝不用残缺的 {id,status} DTO（P1-1）。
        const cached = getTaskPlanFromCache(runtime.queryClient, identityScope, id);
        if (cached) {
          patchTaskPlanEverywhere(runtime.queryClient, identityScope, {
            ...cached,
            status: optimisticStatus,
            updatedAt: Date.now(),
          });
        }
        return { snapshot, identityScope };
      },
      onError: (_error, _id, context) => {
        if (context?.snapshot) {
          restoreTaskPlanSnapshot(
            runtime.queryClient,
            context!.identityScope,
            context.snapshot,
          );
        }
      },
      onSuccess: (dto, _id, context) => {
        patchTaskPlanEverywhere(runtime.queryClient, context!.identityScope, dto.toDTO());
        toast.success(t(successKey));
      },
      onSettled: (_data, _error, id, context) => {
        void runtime.dispatcher.invalidate({
          target: 'task-plan',
          identityScope: context!.identityScope,
          source: 'mutation',
          entityId: id,
        });
      },
    });
  }

  const activateTemplate = createStatusMutation(
    (id) => service.activateTemplate(id),
    'task.error.activateFailed',
    'task.error.activateSuccess',
    'Active',
  );
  const pauseTemplate = createStatusMutation(
    (id) => service.pauseTemplate(id),
    'task.error.pauseFailed',
    'task.error.pauseSuccess',
    'Paused',
  );
  const archiveTemplate = createStatusMutation(
    (id) => service.archiveTemplate(id),
    'task.error.archiveFailed',
    'task.error.archiveSuccess',
    'Closed',
  );

  // 视图兼容的 safe wrappers：失败返回 null/false（错误已由 onError/toast 报告），成功返回结果。
  // View-compatible safe wrappers: null/false on failure, resolved data on success.
  async function createTemplateSafe(
    req: CreateTaskPlanReq,
    feedbackIntent: CreateTemplateFeedbackIntent = 'plan',
  ) {
    try {
      return await createTemplate.mutateAsync({ req, feedbackIntent });
    } catch {
      return null;
    }
  }

  async function updateTemplateSafe(id: string, req: UpdateTaskPlanReq) {
    try {
      return await updateTemplate.mutateAsync({ id, req });
    } catch {
      return null;
    }
  }

  async function deleteTemplateSafe(id: string): Promise<boolean> {
    try {
      await deleteTemplate.mutateAsync(id);
      return true;
    } catch {
      return false;
    }
  }

  async function deleteTemplatesSafe(ids: readonly string[]): Promise<boolean> {
    if (ids.length === 0) return true;
    try {
      await deleteTemplates.mutateAsync({ ids, identityScope: resolveIdentityScope() });
      return true;
    } catch {
      return false;
    }
  }

  async function statusSafe(mutation: typeof activateTemplate, id: string) {
    try {
      return await mutation.mutateAsync(id);
    } catch {
      return null;
    }
  }

  return {
    // Raw mutations (optimistic lifecycle; used by tests / advanced callers).
    createTemplate,
    updateTemplate,
    deleteTemplate,
    deleteTemplates,
    activateTemplate,
    pauseTemplate,
    archiveTemplate,
    // View-compatible safe wrappers.
    createTemplateSafe,
    updateTemplateSafe,
    deleteTemplateSafe,
    deleteTemplatesSafe,
    activateTemplateSafe: (id: string) => statusSafe(activateTemplate, id),
    pauseTemplateSafe: (id: string) => statusSafe(pauseTemplate, id),
    archiveTemplateSafe: (id: string) => statusSafe(archiveTemplate, id),
    isSaving: computed(
      () =>
        createTemplate.isPending.value ||
        updateTemplate.isPending.value ||
        deleteTemplate.isPending.value ||
        deleteTemplates.isPending.value ||
        activateTemplate.isPending.value ||
        pauseTemplate.isPending.value ||
        archiveTemplate.isPending.value,
    ),
  };
}
