import { installGoalUiHost } from '@goal-ui-test-host/di/goal-ui-host';
import { effectScope, ref } from 'vue';
import { flushPromises } from '@vue/test-utils';
import { beforeEach, expect, it, vi } from 'vitest';
import { createMockGoalMutationReceipt } from '@memoflow/goal-contracts/test-support/goal.mock';
import { useGoalWorkspace } from './useGoalWorkspace';
const service = vi.hoisted(() => ({ getGoalWorkspace: vi.fn() }));
vi.mock('@goal-ui-test-host/shared/utils/useStrictInject', () => ({
  useStrictInject: () => service,
}));
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

installGoalUiHost();

it.each([
  ['NOT_FOUND', 'not-found'],
  ['FORBIDDEN', 'forbidden'],
  ['UNAUTHORIZED', 'forbidden'],
  ['SERVICE_UNAVAILABLE', 'temporary'],
])('classifies %s workspace failures without assuming deletion', async (code, kind) => {
  service.getGoalWorkspace.mockResolvedValueOnce({
    ok: false,
    error: { code, message: 'failure' },
  });
  const scope = effectScope();
  const state = scope.run(() => useGoalWorkspace('goal-1'))!;
  await flushPromises();
  expect(state.errorKind.value).toBe(kind);
  scope.stop();
});
it('keeps an already loaded Goal during a transient refresh failure and clears feedback on retry', async () => {
  service.getGoalWorkspace
    .mockResolvedValueOnce(response('goal-1'))
    .mockRejectedValueOnce(new Error('Offline'))
    .mockResolvedValueOnce(response('goal-1'));
  const scope = effectScope();
  const state = scope.run(() => useGoalWorkspace('goal-1'))!;
  await flushPromises();
  await state.refresh();
  expect(state.workspace.value?.goal.id).toBe('goal-1');
  expect(state.errorKind.value).toBe('temporary');
  await state.refresh();
  expect(state.error.value).toBeNull();
  expect(state.errorKind.value).toBeNull();
  scope.stop();
});

it.each(['NOT_FOUND', 'FORBIDDEN'])(
  'clears cached Goal content when a refresh returns %s',
  async (code) => {
    service.getGoalWorkspace.mockResolvedValueOnce(response('goal-1')).mockResolvedValueOnce({
      ok: false,
      error: { code, message: 'no access' },
    });
    const scope = effectScope();
    const state = scope.run(() => useGoalWorkspace('goal-1'))!;
    await flushPromises();
    expect(state.workspace.value?.goal.id).toBe('goal-1');
    await state.refresh();
    expect(state.workspace.value).toBeNull();
    scope.stop();
  },
);
