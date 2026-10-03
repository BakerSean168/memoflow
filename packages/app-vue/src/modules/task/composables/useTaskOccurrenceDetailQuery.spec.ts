import { ref } from 'vue';
import { expect, it, vi } from 'vitest';
import { ok } from '@memoflow/contracts/result';
import { createTestServerStateRuntime } from '../../../platform/server-state';
import { taskOccurrenceQueryKeys } from '../../../platform/server-state/query-keys';
import { mountTaskComposable } from './taskQueryTestUtils';
import { useTaskOccurrenceDetailQuery } from './useTaskOccurrenceDetailQuery';
import { instance } from '../components/task-quick-test-fixtures';

it('deduplicates owner reads in the shared cache and isolates identity changes', async () => {
  const identity = ref('identity-1');
  const runtime = createTestServerStateRuntime();
  const service = { getOccurrence: vi.fn(async () => ok({ toDTO: () => instance() })) };
  const first = mountTaskComposable(() => useTaskOccurrenceDetailQuery('occurrence-1'), {
    service,
    runtime,
    identityScope: () => identity.value,
  });
  const second = mountTaskComposable(() => useTaskOccurrenceDetailQuery('occurrence-1'), {
    service,
    runtime,
    identityScope: () => identity.value,
  });
  await vi.waitFor(() => expect(second.api.occurrence.value?.id).toBe('occurrence-1'));
  expect(first.api.occurrence.value).toEqual(instance());
  expect(service.getOccurrence).toHaveBeenCalledTimes(1);
  identity.value = 'identity-2';
  await vi.waitFor(() => expect(service.getOccurrence).toHaveBeenCalledTimes(2));
  expect(
    runtime.queryClient.getQueryData(taskOccurrenceQueryKeys.detail('identity-1', 'occurrence-1')),
  ).toEqual(instance());
  await vi.waitFor(() =>
    expect(
      runtime.queryClient.getQueryData(
        taskOccurrenceQueryKeys.detail('identity-2', 'occurrence-1'),
      ),
    ).toEqual(instance()),
  );
});
it('captures reactive owner ids per request so an old response cannot replace the next owner', async () => {
  const id = ref('occurrence-1');
  let resolveFirst!: (
    value: ReturnType<typeof ok<{ toDTO: () => ReturnType<typeof instance> }>>,
  ) => void;
  const service = {
    getOccurrence: vi.fn((ownerId: string) =>
      ownerId === 'occurrence-1'
        ? new Promise<ReturnType<typeof ok<{ toDTO: () => ReturnType<typeof instance> }>>>(
            (resolve) => {
              resolveFirst = resolve;
            },
          )
        : Promise.resolve(
            ok({ toDTO: () => instance({ id: 'second' as ReturnType<typeof instance>['id'] }) }),
          ),
    ),
  };
  const { api } = mountTaskComposable(() => useTaskOccurrenceDetailQuery(id), { service });
  id.value = 'second';
  await vi.waitFor(() => expect(api.occurrence.value?.id).toBe('second'));
  resolveFirst(ok({ toDTO: () => instance() }));
  await vi.waitFor(() => expect(api.occurrence.value?.id).toBe('second'));
  expect(service.getOccurrence.mock.calls.map((call) => call[0])).toEqual([
    'occurrence-1',
    'second',
  ]);
});
