import { effectScope, ref } from 'vue';
import { flushPromises } from '@vue/test-utils';
import { beforeEach, expect, it, vi } from 'vitest';
import { createMockGoalMutationReceipt } from '@memoflow/contracts/mocks';
import { useGoalWorkspace } from './useGoalWorkspace';
const service = vi.hoisted(() => ({ getGoalWorkspace: vi.fn() }));
vi.mock('../../../shared/utils/useStrictInject', () => ({ useStrictInject: () => service }));
beforeEach(() => vi.clearAllMocks());
function response(id: string) {
  return {
    ok: true,
    data: {
      goal: createMockGoalMutationReceipt({ id: id as never }).readModel,
      taskContext: { availability: 'Unavailable', summary: null, preview: [] },
      knowledgeContext: { availability: 'Unavailable', summary: null, preview: [] },
      recentProgress: [],
      recentReviews: [],
    },
  };
}
it('clears the previous owner and ignores a late workspace response after navigation', async () => {
  let finish!: (value: unknown) => void;
  service.getGoalWorkspace
    .mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    )
    .mockResolvedValueOnce(response('goal-2'));
  const id = ref('goal-1');
  const scope = effectScope();
  const workspace = scope.run(() => useGoalWorkspace(id))!;
  id.value = 'goal-2';
  await flushPromises();
  expect(workspace.workspace.value?.goal.id).toBe('goal-2');
  finish(response('goal-1'));
  await flushPromises();
  expect(workspace.workspace.value?.goal.id).toBe('goal-2');
  expect(workspace.isLoading.value).toBe(false);
  scope.stop();
});
it('reports a thrown read failure deterministically and recovers on retry', async () => {
  service.getGoalWorkspace
    .mockRejectedValueOnce(new Error('Offline'))
    .mockResolvedValueOnce(response('goal-1'));
  const scope = effectScope();
  const workspace = scope.run(() => useGoalWorkspace('goal-1'))!;
  await flushPromises();
  expect(workspace.workspace.value).toBeNull();
  expect(workspace.error.value).toBeTruthy();
  expect(workspace.isLoading.value).toBe(false);
  await workspace.refresh();
  expect(workspace.workspace.value?.goal.id).toBe('goal-1');
  expect(workspace.error.value).toBeNull();
  scope.stop();
});
it('does not publish a pending workspace when the owner is cleared', async () => {
  let finish!: (value: unknown) => void;
  service.getGoalWorkspace.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const id = ref<string | null>('goal-1');
  const scope = effectScope();
  const workspace = scope.run(() => useGoalWorkspace(id))!;
  id.value = null;
  await flushPromises();
  finish(response('goal-1'));
  await flushPromises();
  expect(workspace.workspace.value).toBeNull();
  expect(workspace.isLoading.value).toBe(false);
  scope.stop();
});
