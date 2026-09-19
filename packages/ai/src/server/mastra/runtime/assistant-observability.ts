import type { AssistantRuntimeEvent } from '@memoflow/contracts/ai';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import type { AIExecutionRecordInput } from '../../application/ports';
import { estimateAIExecutionCost } from '../../application/use-cases/commands/ai-observability';
import type { ResolvedAIModel } from '../models';

export interface AssistantUsageSnapshot {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
}

export type AssistantTurnOutcome =
  | 'assistant.run.completed'
  | 'assistant.run.failed'
  | 'assistant.run.cancelled';

export function projectAssistantUsage(
  modelId: string,
  usage: AssistantUsageSnapshot,
): Extract<AssistantRuntimeEvent, { type: 'assistant.usage.updated' }>['data'] {
  const estimatedCost = estimateAIExecutionCost(modelId, usage)?.totalCostUsd;
  return {
    ...usage,
    ...(estimatedCost !== undefined ? { estimatedCost } : {}),
  };
}

/** Build the bounded terminal operations fact for one Assistant turn. */
export function createAssistantExecutionRecord(input: {
  readonly identityId: string;
  readonly context?: Pick<ExecutionContext, 'requestId' | 'traceId'>;
  readonly conversationId: string;
  readonly model: Pick<ResolvedAIModel, 'providerId' | 'modelId'>;
  readonly runId: string;
  readonly outcome: AssistantTurnOutcome;
  readonly usage?: AssistantUsageSnapshot;
  readonly runtimeErrorCode?: string;
  readonly processingMs: number;
}): AIExecutionRecordInput {
  const completed = input.outcome === 'assistant.run.completed';
  const cancelled = input.outcome === 'assistant.run.cancelled';
  const costEstimate = input.usage
    ? estimateAIExecutionCost(input.model.modelId, input.usage)
    : undefined;

  return {
    identityId: input.identityId,
    operation: 'assistant.turn',
    outcome: completed ? 'succeeded' : cancelled ? 'cancelled' : 'failed',
    conversationId: input.conversationId,
    runId: input.runId,
    ...(input.context?.requestId ? { requestId: input.context.requestId } : {}),
    ...(input.context?.traceId ? { traceId: input.context.traceId } : {}),
    providerConnectionId: String(input.model.providerId),
    modelId: input.model.modelId,
    ...(!completed
      ? {
          errorCategory: cancelled ? 'aborted' : input.runtimeErrorCode ?? 'MASTRA_RUNTIME_ERROR',
          safeError: cancelled ? 'aborted' : 'AI runtime request failed',
        }
      : {}),
    ...(input.usage ? { tokenUsage: input.usage } : {}),
    ...(costEstimate ? { costEstimate } : {}),
    latencyMs: Math.max(0, input.processingMs),
  };
}
