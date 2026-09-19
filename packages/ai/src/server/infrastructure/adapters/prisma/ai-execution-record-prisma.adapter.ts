import { randomUUID } from 'node:crypto';

import type { PrismaClient } from '@memoflow/database';
import type {
  AIExecutionRecordInput,
  AIUsageQuery,
  AIUsageSummary,
  IAIExecutionRecordPort,
  IAIUsageReadPort,
} from '../../../application/ports';

function parseTokenUsage(raw: string | null): {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
} | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    const promptTokens = Number(value.promptTokens);
    const completionTokens = Number(value.completionTokens);
    const totalTokens = Number(value.totalTokens);
    if (![promptTokens, completionTokens, totalTokens].every(Number.isFinite)) return null;
    return {
      promptTokens: Math.max(0, Math.trunc(promptTokens)),
      completionTokens: Math.max(0, Math.trunc(completionTokens)),
      totalTokens: Math.max(0, Math.trunc(totalTokens)),
    };
  } catch {
    return null;
  }
}

export class AIExecutionRecordPrismaAdapter implements IAIExecutionRecordPort, IAIUsageReadPort {
  constructor(private readonly prisma: PrismaClient) {}

  async record(input: AIExecutionRecordInput): Promise<void> {
    const now = new Date();
    await this.prisma.aiExecutionRecord.create({
      data: {
        id: randomUUID(),
        identityId: input.identityId,
        operation: input.operation,
        outcome: input.outcome,
        conversationId: input.conversationId ?? null,
        runId: input.runId ?? null,
        requestId: input.requestId ?? null,
        traceId: input.traceId ?? null,
        providerConnectionId: input.providerConnectionId ?? null,
        modelId: input.modelId ?? null,
        errorCategory: input.errorCategory ?? null,
        safeError: input.safeError ?? null,
        estimatedCostUsd: input.costEstimate?.totalCostUsd ?? null,
        tokenUsage: input.tokenUsage ? JSON.stringify(input.tokenUsage) : null,
        latencyMs: input.latencyMs ?? null,
        createdAt: now,
        completedAt: now,
      },
    });
  }

  async summarizeUsage(input: AIUsageQuery): Promise<AIUsageSummary> {
    const rows = await this.prisma.aiExecutionRecord.findMany({
      where: {
        identityId: input.identityId,
        ...(input.conversationId ? { conversationId: input.conversationId } : {}),
        ...(input.runId ? { runId: input.runId } : {}),
      },
      select: { tokenUsage: true, estimatedCostUsd: true },
      orderBy: { createdAt: 'asc' },
    });

    let promptTokens = 0;
    let completionTokens = 0;
    let totalTokens = 0;
    let estimatedCost = 0;
    let hasCost = false;
    for (const row of rows) {
      const usage = parseTokenUsage(row.tokenUsage);
      if (usage) {
        promptTokens += usage.promptTokens;
        completionTokens += usage.completionTokens;
        totalTokens += usage.totalTokens;
      }
      if (row.estimatedCostUsd !== null && Number.isFinite(row.estimatedCostUsd)) {
        estimatedCost += row.estimatedCostUsd;
        hasCost = true;
      }
    }

    return {
      executionCount: rows.length,
      promptTokens,
      completionTokens,
      totalTokens,
      ...(hasCost ? { estimatedCost } : {}),
    };
  }
}
