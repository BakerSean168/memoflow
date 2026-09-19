import { randomUUID } from 'node:crypto';

import type { AIExecutionRecordInput, AICostEstimate, ChatExecutionUsage } from '../../ports';
import { AIExecutionError, isAIExecutionError } from '../../../../shared/ai-execution-error';

interface AIPricingRule {
  pricingModel: string;
  inputPerMillionUsd: number;
  outputPerMillionUsd: number;
  matches(model: string): boolean;
}

const AI_COST_PRICING_VERSION = 'static-catalog-2026-03';
const AI_PRICING_RULES: readonly AIPricingRule[] = [
  {
    pricingModel: 'gpt-4o-mini',
    inputPerMillionUsd: 0.15,
    outputPerMillionUsd: 0.6,
    matches: (model) => model === 'gpt-4o-mini' || model.startsWith('gpt-4o-mini-'),
  },
  {
    pricingModel: 'gpt-4o',
    inputPerMillionUsd: 2.5,
    outputPerMillionUsd: 10,
    matches: (model) => model === 'gpt-4o' || model.startsWith('gpt-4o-'),
  },
  {
    pricingModel: 'deepseek-chat',
    inputPerMillionUsd: 0.27,
    outputPerMillionUsd: 1.1,
    matches: (model) => model === 'deepseek-chat' || model.startsWith('deepseek-chat-'),
  },
  {
    pricingModel: 'free-tier-model',
    inputPerMillionUsd: 0,
    outputPerMillionUsd: 0,
    matches: (model) => model.includes(':free'),
  },
];

export function createAIRequestId(): string {
  return randomUUID();
}

export function classifyAIExecutionError(error: unknown): string {
  if (isAIExecutionError(error)) return error.category;
  if (error && typeof error === 'object' && 'category' in error) {
    const category = (error as { category?: unknown }).category;
    if (typeof category === 'string' && category.trim()) return category;
  }
  if (error instanceof Error && error.name === 'AbortError') return 'aborted';
  return 'unknown';
}

export function attachRequestIdToError(error: unknown, requestId: string): Error {
  if (isAIExecutionError(error)) {
    if (error.requestId === requestId) return error;
    return new AIExecutionError(error.category, error.message, {
      requestId,
      statusCode: error.statusCode,
      cause: error,
    });
  }
  if (error instanceof Error) {
    const enriched = new Error(error.message);
    Object.assign(enriched, { requestId, cause: error });
    return enriched;
  }
  return new AIExecutionError('internal', 'AI execution failed', { requestId, cause: error });
}

export function withAICostEstimate(input: AIExecutionRecordInput): AIExecutionRecordInput {
  if (input.costEstimate || !input.modelId || !input.tokenUsage) {
    return input;
  }

  const costEstimate = estimateAIExecutionCost(input.modelId, input.tokenUsage);
  if (!costEstimate) {
    return input;
  }

  return {
    ...input,
    costEstimate,
  };
}

export function estimateAIExecutionCost(
  model: string,
  tokenUsage: ChatExecutionUsage,
): AICostEstimate | undefined {
  const normalizedModel = model.trim().toLowerCase();
  if (!normalizedModel) {
    return undefined;
  }

  const pricingRule = AI_PRICING_RULES.find((rule) => rule.matches(normalizedModel));
  if (!pricingRule) {
    return undefined;
  }

  const promptCostUsd =
    ((tokenUsage.promptTokens ?? 0) / 1_000_000) * pricingRule.inputPerMillionUsd;
  const completionCostUsd =
    ((tokenUsage.completionTokens ?? 0) / 1_000_000) * pricingRule.outputPerMillionUsd;

  return {
    promptCostUsd: roundUsd(promptCostUsd),
    completionCostUsd: roundUsd(completionCostUsd),
    totalCostUsd: roundUsd(promptCostUsd + completionCostUsd),
    pricingVersion: AI_COST_PRICING_VERSION,
    pricingModel: pricingRule.pricingModel,
  };
}

function roundUsd(value: number): number {
  return Math.round(value * 100_000_000) / 100_000_000;
}
