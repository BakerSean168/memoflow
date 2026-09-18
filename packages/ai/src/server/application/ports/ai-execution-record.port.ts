import type { AIRuntimeUsage } from '@memoflow/contracts/ai';
import type { ChatExecutionUsage } from './chat-execution.port';

export interface AICostEstimate {
  promptCostUsd: number;
  completionCostUsd: number;
  totalCostUsd: number;
  pricingVersion: string;
  pricingModel: string;
}

/** Terminal operations projection. Mastra remains workflow/runtime authority. */
export type AIExecutionOutcome = 'succeeded' | 'failed' | 'cancelled';

/**
 * Canonical write shape for AIExecutionRecord.
 *
 * Deliberately excludes prompts, model output, workflow drafts/snapshots,
 * resume cursors, pending tool state and arbitrary payload bags. Only bounded
 * correlation, usage and sanitized terminal failure metadata may cross this
 * persistence boundary.
 */
export interface AIExecutionRecordInput {
  identityId: string;
  operation: string;
  outcome: AIExecutionOutcome;
  conversationId?: string;
  runId?: string;
  requestId?: string;
  traceId?: string;
  providerConnectionId?: string;
  modelId?: string;
  errorCategory?: string;
  safeError?: string;
  tokenUsage?: ChatExecutionUsage;
  costEstimate?: AICostEstimate;
  latencyMs?: number;
}

export interface IAIExecutionRecordPort {
  record(input: AIExecutionRecordInput): Promise<void>;
}

export interface AIUsageQuery {
  identityId: string;
  conversationId?: string;
  runId?: string;
}

export interface AIUsageSummary extends AIRuntimeUsage {
  executionCount: number;
}

/** Read-only operations projection. Identity is always part of the query boundary. */
export interface IAIUsageReadPort {
  summarizeUsage(input: AIUsageQuery): Promise<AIUsageSummary>;
}
