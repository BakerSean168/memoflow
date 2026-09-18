import { describe, expect, it } from 'vitest';
import { createAssistantExecutionRecord, projectAssistantUsage } from './assistant-observability';

const model = { providerId: 'provider-1', providerName: 'OpenAI Compatible', modelId: 'gpt-4o-mini' };
const usage = { promptTokens: 1_000, completionTokens: 500, totalTokens: 1_500 };

describe('Mastra Assistant observability projection', () => {
  it('projects token usage with the static catalog cost', () => {
    expect(projectAssistantUsage(model.modelId, usage)).toEqual({ ...usage, estimatedCost: 0.00045 });
  });

  it('records only bounded correlation, model, usage and cost', () => {
    const record = createAssistantExecutionRecord({
      identityId: 'identity-1',
      context: { requestId: 'req-1', traceId: 'trace-1' },
      conversationId: 'conversation-1',
      model,
      runId: 'run-1',
      outcome: 'assistant.run.completed',
      usage,
      processingMs: 27,
    });
    expect(record).toEqual(
      expect.objectContaining({
        identityId: 'identity-1',
        operation: 'assistant.turn',
        outcome: 'succeeded',
        conversationId: 'conversation-1',
        runId: 'run-1',
        requestId: 'req-1',
        traceId: 'trace-1',
        providerConnectionId: 'provider-1',
        modelId: 'gpt-4o-mini',
        tokenUsage: usage,
        costEstimate: expect.objectContaining({ pricingModel: 'gpt-4o-mini', totalCostUsd: 0.00045 }),
        latencyMs: 27,
      }),
    );
    expect(record).not.toHaveProperty('input');
    expect(record).not.toHaveProperty('result');
    expect(record).not.toHaveProperty('prompt');
    expect(record.safeError).toBeUndefined();
  });

  it('distinguishes cancellation and failure with sanitized errors', () => {
    const cancelled = createAssistantExecutionRecord({
      identityId: 'identity-1', conversationId: 'conversation-1', model,
      runId: 'run-cancelled', outcome: 'assistant.run.cancelled', processingMs: -1,
    });
    expect(cancelled).toEqual(expect.objectContaining({
      outcome: 'cancelled', errorCategory: 'aborted', safeError: 'aborted', latencyMs: 0,
    }));

    const failed = createAssistantExecutionRecord({
      identityId: 'identity-1', conversationId: 'conversation-1', model,
      runId: 'run-failed', outcome: 'assistant.run.failed', runtimeErrorCode: 'PROVIDER_500', processingMs: 12,
    });
    expect(failed).toEqual(expect.objectContaining({
      outcome: 'failed', errorCategory: 'PROVIDER_500', safeError: 'AI runtime request failed',
    }));
    expect(JSON.stringify(failed)).not.toContain('apiKey');
  });

  it('omits cost when the model is not in the static pricing catalog', () => {
    expect(projectAssistantUsage('custom-model', usage)).toEqual(usage);
    const record = createAssistantExecutionRecord({
      identityId: 'identity-1', conversationId: 'conversation-1',
      model: { ...model, modelId: 'custom-model' }, runId: 'run-1',
      outcome: 'assistant.run.completed', usage, processingMs: 1,
    });
    expect(record.costEstimate).toBeUndefined();
  });
});
