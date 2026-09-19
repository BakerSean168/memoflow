import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@memoflow/database';
import type { IElectronDatabase } from '@memoflow/contracts/electron';
import { AIExecutionRecordPrismaAdapter } from '../prisma/ai-execution-record-prisma.adapter';
import { AIExecutionRecordPowerSyncAdapter } from '../powersync/ai-execution-record-powersync.adapter';

const recordInput = {
  identityId: 'identity-1',
  operation: 'assistant.turn',
  outcome: 'succeeded' as const,
  conversationId: 'conversation-1',
  runId: 'run-1',
  requestId: 'request-1',
  traceId: 'trace-1',
  providerConnectionId: 'provider-1',
  modelId: 'gpt-4o-mini',
  tokenUsage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 },
  costEstimate: {
    promptCostUsd: 0.000015,
    completionCostUsd: 0.000012,
    totalCostUsd: 0.000027,
    pricingVersion: 'static-v1',
    pricingModel: 'gpt-4o-mini',
  },
  latencyMs: 42,
};

describe('AIExecutionRecord indexed usage projection', () => {
  it('Prisma writes bounded indexed correlation fields and sums usage under the identity', async () => {
    const create = vi.fn(async () => ({}));
    const findMany = vi.fn(async () => [
      { tokenUsage: JSON.stringify(recordInput.tokenUsage), estimatedCostUsd: 0.000027 },
      {
        tokenUsage: JSON.stringify({ promptTokens: 50, completionTokens: 10, totalTokens: 60 }),
        estimatedCostUsd: 0.0000135,
      },
    ]);
    const prisma = { aiExecutionRecord: { create, findMany } } as unknown as PrismaClient;
    const adapter = new AIExecutionRecordPrismaAdapter(prisma);

    await adapter.record(recordInput);
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        identityId: 'identity-1',
        operation: 'assistant.turn',
        outcome: 'succeeded',
        conversationId: 'conversation-1',
        runId: 'run-1',
        requestId: 'request-1',
        traceId: 'trace-1',
        providerConnectionId: 'provider-1',
        modelId: 'gpt-4o-mini',
        estimatedCostUsd: 0.000027,
        latencyMs: 42,
      }),
    });
    const persisted = create.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(persisted).not.toHaveProperty('input');
    expect(persisted).not.toHaveProperty('result');
    expect(persisted).not.toHaveProperty('prompt');
    expect(persisted).not.toHaveProperty('workflowSnapshot');

    await expect(
      adapter.summarizeUsage({ identityId: 'identity-1', conversationId: 'conversation-1' }),
    ).resolves.toMatchObject({
      executionCount: 2,
      promptTokens: 150,
      completionTokens: 30,
      totalTokens: 180,
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { identityId: 'identity-1', conversationId: 'conversation-1' },
      }),
    );
  });

  it('PowerSync binds identity and run as SQL predicates', async () => {
    const execute = vi.fn(async () => ({ rowsAffected: 1 }));
    const getAll = vi.fn(async () => [
      { token_usage: JSON.stringify(recordInput.tokenUsage), estimated_cost_usd: 0.000027 },
    ]);
    const adapter = new AIExecutionRecordPowerSyncAdapter({ execute, getAll } as unknown as IElectronDatabase);

    await adapter.record(recordInput);
    expect(execute.mock.calls[0]?.[0]).toContain('provider_connection_id, model_id');
    expect(execute.mock.calls[0]?.[1]).toContain('conversation-1');
    expect(execute.mock.calls[0]?.[1]).toContain('run-1');

    await expect(adapter.summarizeUsage({ identityId: 'identity-1', runId: 'run-1' })).resolves.toEqual({
      executionCount: 1,
      promptTokens: 100,
      completionTokens: 20,
      totalTokens: 120,
      estimatedCost: 0.000027,
    });
    expect(getAll.mock.calls[0]?.[0]).toContain('identity_id = ?');
    expect(getAll.mock.calls[0]?.[0]).toContain('run_id = ?');
    expect(getAll.mock.calls[0]?.[1]).toEqual(['identity-1', 'run-1']);
  });
});
