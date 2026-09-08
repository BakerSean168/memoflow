import { describe, expect, it, vi } from 'vitest';
import { fail, ok } from '@memoflow/contracts/result';
import { mountTaskComposable } from './taskQueryTestUtils';
import { useTask } from './useTask';

function makeService() {
  return {
    listTemplates: vi.fn(),
    listInstances: vi.fn(),
    listInstancesByDateRange: vi.fn(),
    getTemplate: vi.fn(),
    createTemplate: vi.fn(),
    updateTemplate: vi.fn(),
    deleteTemplate: vi.fn(),
    activateTemplate: vi.fn(),
    pauseTemplate: vi.fn(),
    archiveTemplate: vi.fn(),
    startInstance: vi.fn(),
    completeInstance: vi.fn(),
    uncompleteInstance: vi.fn(),
    skipInstance: vi.fn(),
  };
}

describe('useTask legacy facade (P2-2)', () => {
  it('surfaces the template list query error through the facade error', async () => {
    const service = makeService();
    service.listTemplates.mockResolvedValue(fail({ code: 'VALIDATION_ERROR', message: 'boom' }));
    const { api } = mountTaskComposable(() => useTask(), { service });

    await api.fetchTemplates({ page: 1, limit: 20 });
    await vi.waitFor(() => expect(api.error.value).toBeTruthy());
    expect(api.error.value).toBe('Please check your input');
  });

  it('retries an errored template list fetch on the next fetchTemplates call', async () => {
    const service = makeService();
    service.listTemplates
      .mockResolvedValueOnce(fail({ code: 'VALIDATION_ERROR', message: 'boom' }))
      .mockResolvedValueOnce(
        ok({ templates: [{ toDTO: () => ({ id: 'tpl-1', name: 'Write tests' }) }], total: 1 }),
      );
    const { api } = mountTaskComposable(() => useTask(), { service });

    await api.fetchTemplates({ page: 1, limit: 20 });
    await vi.waitFor(() => expect(api.error.value).toBeTruthy());
    expect(service.listTemplates).toHaveBeenCalledTimes(1);

    await api.fetchTemplates({ page: 1, limit: 20 });
    await vi.waitFor(() => expect(service.listTemplates).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(api.error.value).toBeFalsy());
    expect(api.templates.value).toHaveLength(1);
  });
});
