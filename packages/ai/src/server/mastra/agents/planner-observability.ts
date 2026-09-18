import type { ExecutionContext } from '@memoflow/contracts/shared';
import type {
  AIExecutionRecordInput,
  ChatExecutionUsage,
  IAIExecutionRecordPort,
} from '../../application/ports';
import { estimateAIExecutionCost } from '../../application/use-cases/commands/ai-observability';

const RESOLVED_PROVIDER_ID = 'resolvedProviderId';
const RESOLVED_MODEL_ID = 'resolvedModelId';

export interface PlannerRequestContext {
  getRaw(key: string): unknown;
  setRaw(key: string, value: unknown): void;
}

export function rememberResolvedPlannerModel(
  requestContext: PlannerRequestContext,
  model: { providerId: string; providerName: string; modelId: string },
): void {
  requestContext.setRaw(RESOLVED_PROVIDER_ID, model.providerId);
  requestContext.setRaw(RESOLVED_MODEL_ID, model.modelId);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function finiteToken(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.trunc(number) : undefined;
}

function isExecutionSource(value: unknown): value is ExecutionContext['source'] {
  return value === 'http' || value === 'ipc' || value === 'system';
}

export function normalizeMastraGenerateUsage(output: unknown): ChatExecutionUsage | undefined {
  if (!output || typeof output !== 'object') return undefined;
  const record = output as Record<string, unknown>;
  const raw = record.totalUsage ?? record.usage;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const usage = raw as Record<string, unknown>;
  const promptTokens = finiteToken(usage.promptTokens ?? usage.inputTokens);
  const completionTokens = finiteToken(usage.completionTokens ?? usage.outputTokens);
  const explicitTotal = finiteToken(usage.totalTokens);
  if (promptTokens === undefined || completionTokens === undefined) return undefined;
  return {
    promptTokens,
    completionTokens,
    totalTokens: explicitTotal ?? promptTokens + completionTokens,
  };
}

function executionContext(requestContext: PlannerRequestContext): ExecutionContext | undefined {
  const raw = requestContext.getRaw('executionContext');
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const record = raw as Record<string, unknown>;
  const identityId = stringValue(record.identityId);
  const requestId = stringValue(record.requestId);
  const traceId = stringValue(record.traceId);
  const startedAt = Number(record.startedAt);
  const source = record.source;
  if (
    !identityId ||
    !requestId ||
    !traceId ||
    !Number.isFinite(startedAt) ||
    !isExecutionSource(source)
  ) {
    return undefined;
  }
  return { identityId, requestId, traceId, startedAt, source };
}

export async function recordPlannerExecution(
  port: IAIExecutionRecordPort | undefined,
  input: {
    identityId: string;
    conversationId: string;
    requestContext: PlannerRequestContext;
    taskType: 'MASTRA_GOAL_PLANNER' | 'MASTRA_TASK_PLANNER' | 'MASTRA_KNOWLEDGE_PLANNER';
    mode: string;
    status: 'COMPLETED' | 'FAILED';
    outcome?: string;
    usage?: ChatExecutionUsage;
    processingMs: number;
  },
): Promise<void> {
  if (!port) return;
  const context = executionContext(input.requestContext);
  const providerId = stringValue(input.requestContext.getRaw(RESOLVED_PROVIDER_ID));
  const modelId = stringValue(input.requestContext.getRaw(RESOLVED_MODEL_ID));
  const runId = stringValue(input.requestContext.getRaw('workflowRunId'));
  const costEstimate = modelId && input.usage ? estimateAIExecutionCost(modelId, input.usage) : undefined;
  const operationByTask = {
    MASTRA_GOAL_PLANNER: 'workflow.goal.plan',
    MASTRA_TASK_PLANNER: 'workflow.task.plan',
    MASTRA_KNOWLEDGE_PLANNER: 'workflow.knowledge.plan',
  } as const;
  const record: AIExecutionRecordInput = {
    identityId: input.identityId,
    operation: operationByTask[input.taskType],
    outcome: input.status === 'COMPLETED' ? 'succeeded' : 'failed',
    conversationId: input.conversationId,
    ...(runId ? { runId } : {}),
    ...(context?.requestId ? { requestId: context.requestId } : {}),
    ...(context?.traceId ? { traceId: context.traceId } : {}),
    ...(providerId ? { providerConnectionId: providerId } : {}),
    ...(modelId ? { modelId } : {}),
    ...(input.status === 'FAILED'
      ? { safeError: 'AI planner request failed', errorCategory: 'MASTRA_PLANNER_ERROR' }
      : {}),
    ...(input.usage ? { tokenUsage: input.usage } : {}),
    ...(costEstimate ? { costEstimate } : {}),
    latencyMs: Math.max(0, input.processingMs),
  };
  // Observability failure must not alter deterministic workflow semantics.
  await port.record(record).catch(() => undefined);
}
