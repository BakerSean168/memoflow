/**
 * useTask - 任务模块薄编排 facade（RefArch Phase 5 迁移后）
 *
 * 组合 template list query、instances（非 pilot，维持现状）与 dependencies 操作。
 * Management/Detail 视图直接使用 graph/detail query 与 template mutations（Step 4），
 * 本 facade 只服务 Daily widget / calendar / capsule 等非 pilot consumer：
 * `templates` 来自 template list key，`fetchTemplates(params)` 以 canonical key 预取并
 * await 收敛，保留命令式语义。
 */

import { computed, ref } from 'vue';
import { useTaskStore } from '../stores/task-store';
import { useServerStateIdentityScope, useServerStateRuntime } from '../../../platform/server-state';
import {
  canonicalizeTaskPlanListQuery,
  taskPlanQueryKeys,
  type TaskPlanListQueryInput,
} from '../../../platform/server-state/query-keys';
import { useTaskOccurrences } from './useTaskOccurrences';
import { useTaskPlanListQuery } from './useTaskPlanListQuery';
import { waitForTaskPlanQuery } from './taskPlanCache';

export function useTask() {
  const store = useTaskStore();
  const runtime = useServerStateRuntime();
  const resolveIdentityScope = useServerStateIdentityScope();
  const listParams = ref<TaskPlanListQueryInput>({});
  // P2-4: keep the default list query disabled until `fetchTemplates` requests it, so no
  // avoidable default `limit:20` fetch fires before a consumer supplies its own params.
  // P2-4：默认 list query 保持禁用，直到 `fetchTemplates` 被调用，避免提前发起默认 limit:20 请求。
  const listRequested = ref(false);
  const templateList = useTaskPlanListQuery({
    params: listParams,
    enabled: listRequested,
  });
  const instanceOps = useTaskOccurrences();

  async function fetchTemplates(query?: TaskPlanListQueryInput) {
    listParams.value = {
      page: query?.page ?? store.pagination.page,
      limit: query?.limit ?? store.pagination.pageSize,
      status: query?.status,
      goalId: query?.goalId,
      labelIdsAll: query?.labelIdsAll,
    };
    listRequested.value = true;
    const queryKey = taskPlanQueryKeys.list(
      resolveIdentityScope(),
      canonicalizeTaskPlanListQuery(listParams.value),
    );
    // An errored query makes the waiter settle instantly without re-requesting; force a
    // refetch so a consumer's retry actually retries (P2-2). Fresh/pending keys still wait.
    // error 态 query 会让 waiter 立即 settle 而不重新请求；这里显式 refetch，让 retry 真正生效（P2-2）。
    if (runtime.queryClient.getQueryState(queryKey)?.status === 'error') {
      await templateList.refetch();
    } else {
      await waitForTaskPlanQuery(runtime.queryClient, queryKey);
    }
  }

  function setPage(p: number) {
    store.setPage(p);
    void fetchTemplates();
  }

  return {
    // State
    templates: templateList.templates,
    instances: computed(() => store.instances),
    isLoading: computed(() => templateList.isLoading.value || store.isLoading),
    // Surface the template list query error so legacy consumers (e.g. TaskCapsulePreview)
    // see failed template fetches instead of treating them as success (P2-2).
    // 暴露 template list query 的 error，让 legacy consumer（如 TaskCapsulePreview）能看到失败而非当作成功（P2-2）。
    error: computed(() => store.error ?? templateList.error.value),
    pagination: computed(() => store.pagination),
    // Template operations (list key)
    fetchTemplates,
    // Instance operations
    fetchInstances: instanceOps.fetchInstances,
    fetchInstancesByDateRange: instanceOps.fetchInstancesByDateRange,
    startInstance: instanceOps.startInstance,
    completeInstance: instanceOps.completeInstance,
    uncompleteInstance: instanceOps.uncompleteInstance,
    rescheduleInstance: instanceOps.rescheduleInstance,
    skipInstance: instanceOps.skipInstance,
    // Pagination
    setPage,
  };
}
