import { RequestContext } from '@mastra/core/request-context';
import { describe, expect, it, vi } from 'vitest';
import type { IAIExecutionRecordPort } from '../../application/ports';
import { normalizeMastraGenerateUsage, recordPlannerExecution, rememberResolvedPlannerModel } from './planner-observability';

describe('Mastra planner observability', () => {
  it('normalizes Mastra input/output token naming', () => {
    expect(normalizeMastraGenerateUsage({ totalUsage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 } })).toEqual({
      promptTokens: 100, completionTokens: 20, totalTokens: 120,
    });
  });

  it('records bounded workflow correlation and resolved model without draft/prompt state', async () => {
    const record = vi.fn(async () => undefined);
    const port: IAIExecutionRecordPort = { record };
    const requestContext = new RequestContext();
    requestContext.setRaw('executionContext', {
      identityId: 'identity-1', requestId: 'request-1', traceId: 'trace-1', startedAt: 1, source: 'http',
    });
    requestContext.setRaw('workflowRunId', 'run-1');
    rememberResolvedPlannerModel(requestContext, {
      providerId: 'provider-1', providerName: 'OpenAI Compatible', modelId: 'gpt-4o-mini',
    });

    await recordPlannerExecution(port, {
      identityId: 'identity-1', conversationId: 'conversation-1', requestContext,
      taskType: 'MASTRA_GOAL_PLANNER', mode: 'initial', status: 'COMPLETED', outcome: 'draft_ready',
      usage: { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 }, processingMs: 20,
    });

    expect(record).toHaveBeenCalledWith(expect.objectContaining({
      identityId: 'identity-1', operation: 'workflow.goal.plan', outcome: 'succeeded',
      conversationId: 'conversation-1', runId: 'run-1', requestId: 'request-1', traceId: 'trace-1',
      providerConnectionId: 'provider-1', modelId: 'gpt-4o-mini',
      tokenUsage: { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 },
      costEstimate: expect.objectContaining({ totalCostUsd: 0.00045 }), latencyMs: 20,
    }));
    const persisted = record.mock.calls[0]?.[0];
    expect(persisted).not.toHaveProperty('input');
    expect(persisted).not.toHaveProperty('result');
    expect(persisted).not.toHaveProperty('draft');
  });
});
