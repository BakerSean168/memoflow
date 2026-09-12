import { taskMockRoutes } from './task.handlers';
import { createHttpClientSpy } from './_shared/contract-test-helpers';
import { describe, expect, it } from 'vitest';

describe('task handlers contracts', () => {
  it('exposes only template and occurrence route prefixes', () => {
    expect(taskMockRoutes.templates).toMatch(/\/task-plans$/);
    expect(taskMockRoutes.instances).toMatch(/\/task-occurrences$/);
    expect(taskMockRoutes).not.toHaveProperty('tasks');
  });

  it('uses the same template occurrence routes and query shape as the adapter', async () => {
    const { TaskPlanHttpAdapter } = await import('@memoflow/task/client');
    const httpClient = createHttpClientSpy();
    const adapter = new TaskPlanHttpAdapter(httpClient);

    await adapter.getInstancesByDateRange('template-1', { from: 100, to: 200 });
    await adapter.generateInstances('template-1', { fromDate: 100, toDate: 200 });

    expect(httpClient.get).toHaveBeenCalledWith('/task-plans/template-1/instances', {
      params: { from: 100, to: 200 },
    });
    expect(httpClient.post).toHaveBeenCalledWith('/task-plans/template-1/generate-instances', {
      fromDate: 100,
      toDate: 200,
    });
  }, 30_000);

  it('uses explicit missed occurrence facts and never calls check-expired', async () => {
    const { TaskOccurrenceHttpAdapter } = await import('@memoflow/task/client');
    const httpClient = createHttpClientSpy();
    const adapter = new TaskOccurrenceHttpAdapter(httpClient);

    await adapter.getTaskOccurrences({ page: 1, limit: 10, templateId: 'template-1', status: 'Pending' });
    await adapter.getTaskOccurrenceById('instance-1');
    await adapter.startTaskOccurrence('instance-1');
    await adapter.completeTaskOccurrence('instance-1', { duration: 30, note: 'done', rating: 5 });
    await adapter.skipTaskOccurrence('instance-2', { reason: 'waived' });
    await adapter.markTaskOccurrenceMissed('instance-3', { reason: 'not completed' });
    await adapter.deleteTaskOccurrence('instance-4');

    expect(httpClient.post).toHaveBeenCalledWith('/task-occurrences/instance-3/missed', {
      reason: 'not completed',
    });
    expect(httpClient.post.mock.calls.flat().join(' ')).not.toContain('check-expired');
  }, 30_000);

  it('uses the current template list route without retired hierarchy filters', async () => {
    const { TaskPlanHttpAdapter } = await import('@memoflow/task/client');
    const httpClient = createHttpClientSpy();
    const adapter = new TaskPlanHttpAdapter(httpClient);

    await adapter.getTaskPlans({
      page: 2,
      limit: 20,
      status: 'Active',
      goalId: 'goal-1',
      tags: ['focus'],
    });

    const requestConfig = httpClient.get.mock.calls[0]?.[1] as { params?: Record<string, unknown> };
    expect(taskMockRoutes.templates).toMatch(/\/task-plans$/);
    expect(requestConfig.params).not.toHaveProperty('folderId');
    expect(requestConfig.params).not.toHaveProperty('urgency');
  }, 30_000);

  it('updates templates via PATCH to match the HTTP adapter', async () => {
    const { TaskPlanHttpAdapter } = await import('@memoflow/task/client');
    const httpClient = createHttpClientSpy();
    const adapter = new TaskPlanHttpAdapter(httpClient);
    await adapter.updateTaskPlan('template-1', { name: 'Renamed' } as never);
    expect(httpClient.patch).toHaveBeenCalledWith('/task-plans/template-1', { name: 'Renamed' });
  }, 30_000);
});
