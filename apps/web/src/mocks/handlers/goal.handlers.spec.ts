import { createMockGoalAggregateResponse, goalMockRoutes } from './goal.handlers';
import {
  createHttpClientSpy,
  expectSchemaFailure,
  expectSchemaSuccess,
  successResult,
} from './_shared/contract-test-helpers';
import { describe, expect, it } from 'vitest';
import {
  CloneGoalSchema,
  CreateGoalSchema,
  GetGoalAggregateResSchema,
  QueryGoalsResSchema,
  UpdateGoalSchema,
} from '@memoflow/contracts/goal';
import {
  createMockGoal,
  createMockGoalMutationReceipt,
  createMockQueryGoalsRes,
} from '@memoflow/contracts/mocks';

describe('goal handlers contracts', () => {
  it('exposes only the canonical goal route prefix', () => {
    expect(goalMockRoutes.goals).toMatch(/\/goals$/);
    expect(goalMockRoutes).not.toHaveProperty('folders');
  });

  it('keeps goal aggregate and query response shapes aligned with contracts', () => {
    const aggregateResponse = createMockGoalAggregateResponse(createMockGoal().id);
    expectSchemaSuccess(GetGoalAggregateResSchema, aggregateResponse);
    expectSchemaSuccess(QueryGoalsResSchema, createMockQueryGoalsRes(3));
  });

  it('uses the vNext create, update, search, aggregate, and clone contracts', async () => {
    const { GoalHttpAdapter } = await import('@memoflow/goal/client');
    const httpClient = createHttpClientSpy();
    const adapter = new GoalHttpAdapter(httpClient);
    const aggregateResponse = createMockGoalAggregateResponse(createMockGoal().id);
    const queryResponse = createMockQueryGoalsRes(2);

    httpClient.post
      .mockResolvedValueOnce(successResult(createMockGoalMutationReceipt()))
      .mockResolvedValueOnce(successResult(createMockGoalMutationReceipt()));
    httpClient.patch.mockResolvedValueOnce(successResult(createMockGoalMutationReceipt()));
    httpClient.get
      .mockResolvedValueOnce(successResult(queryResponse))
      .mockResolvedValueOnce(successResult(aggregateResponse));

    const createPayload = expectSchemaSuccess(CreateGoalSchema, {
      name: 'Ship web contracts',
      summary: 'Unify adapter payloads',
      dueDate: Date.now(),
    });
    const updatePayload = expectSchemaSuccess(UpdateGoalSchema, {
      expectedVersion: 1,
      name: 'Ship web contracts v2',
      summary: 'Updated scope',
    });
    const clonePayload = expectSchemaSuccess(CloneGoalSchema, {
      name: 'Ship web contracts (copy)',
      includeKeyResults: true,
    });

    expectSchemaFailure(CreateGoalSchema, { importance: 'Important' });
    expectSchemaFailure(CreateGoalSchema, { name: 'Legacy', category: 'work' });
    expectSchemaFailure(UpdateGoalSchema, { expectedVersion: 1, folderId: 'folder-1' });

    await adapter.createGoal(createPayload);
    await adapter.updateGoal('goal-1', updatePayload);
    await adapter.searchGoals({ query: 'contracts', page: 1, limit: 20 });
    await adapter.getGoalAggregateView('goal-1');
    await adapter.cloneGoal('goal-1', clonePayload);

    expect(httpClient.post).toHaveBeenNthCalledWith(1, '/goals', createPayload);
    expect(httpClient.patch).toHaveBeenCalledWith('/goals/goal-1', updatePayload);
    expect(httpClient.get).toHaveBeenNthCalledWith(1, '/goals/search', {
      params: { query: 'contracts', page: 1, limit: 20 },
    });
    expect(httpClient.get).toHaveBeenNthCalledWith(2, '/goals/goal-1/aggregate');
    expect(httpClient.post).toHaveBeenNthCalledWith(2, '/goals/goal-1/clone', clonePayload);
  }, 30_000);
});
