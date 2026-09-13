import { describe, expect, it, vi } from 'vitest';
import { fail, ok } from '@memoflow/contracts/result';
import { mountTaskComposable } from './taskQueryTestUtils';
import { useTask } from './useTask';

function makeService() {
  return {
    listPlans: vi.fn(),
    listOccurrences: vi.fn(),
    listOccurrencesByDateRange: vi.fn(),
    getPlan: vi.fn(),
    createPlan: vi.fn(),
    updatePlan: vi.fn(),
    deletePlan: vi.fn(),
    activatePlan: vi.fn(),
    pausePlan: vi.fn(),
    archivePlan: vi.fn(),
    startOccurrence: vi.fn(),
    completeOccurrence: vi.fn(),
    uncompleteOccurrence: vi.fn(),
    skipOccurrence: vi.fn(),
  };
}

describe('useTask legacy facade (P2-2)', () => {
  it('surfaces the template list query error through the facade error', async () => {
    const service = makeService();
    service.listPlans.mockResolvedValue(fail({ code: 'VALIDATION_ERROR', message: 'boom' }));
    const { api } = mountTaskComposable(() => useTask(), { service });

    await api.fetchTemplates({ page: 1, limit: 20 });
    await vi.waitFor(() => expect(api.error.value).toBeTruthy());
    expect(api.error.value).toBe('Please check your input');
  });

  it('retries an errored template list fetch on the next fetchTemplates call', async () => {
    const service = makeService();
    service.listPlans
      .mockResolvedValueOnce(fail({ code: 'VALIDATION_ERROR', message: 'boom' }))
      .mockResolvedValueOnce(
        ok({ plans: [{ toDTO: () => ({ id: 'tpl-1', name: 'Write tests' }) }], total: 1 }),
      );
    const { api } = mountTaskComposable(() => useTask(), { service });

    await api.fetchTemplates({ page: 1, limit: 20 });
    await vi.waitFor(() => expect(api.error.value).toBeTruthy());
    expect(service.listPlans).toHaveBeenCalledTimes(1);

    await api.fetchTemplates({ page: 1, limit: 20 });
    await vi.waitFor(() => expect(service.listPlans).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(api.error.value).toBeFalsy());
    expect(api.templates.value).toHaveLength(1);
  });
});
