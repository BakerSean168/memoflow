import {
  AIRateLimitPublicFailureSchema,
  type AIWorkflowExecutionFailure,
  type AIWorkflowTerminalFailure,
} from '@memoflow/ai-contracts';
import { extractStructuredResultError } from '@memoflow/contracts/result';
import { translateResultError } from '../ai-ui-host';
import type { LocalAgentExecutionFailure } from '@memoflow/ai-contracts';
import type { ChatItem } from './types';

export function getAIErrorMessage(error: unknown, t: (key: string) => string, fallbackKey: string) {
  return translateResultError(error, t, { fallbackKey });
}

export function workflowInterruptionFailure(error: unknown): AIWorkflowTerminalFailure {
  const structured = extractStructuredResultError(error);
  const rateLimit = AIRateLimitPublicFailureSchema.safeParse(structured?.failure);
  return {
    code: structured?.code ?? 'AI_WORKFLOW_RUNTIME_ERROR',
    message: 'Workflow request interrupted',
    ...(rateLimit.success && rateLimit.data.details ? { details: rateLimit.data.details } : {}),
    ...(rateLimit.success && rateLimit.data.retryHint
      ? { retryHint: rateLimit.data.retryHint }
      : {}),
  };
}

/** Stable UI text for a terminal workflow failure; raw provider details stay server-side. */
export function getAIWorkflowTerminalFailureMessage(
  failure: AIWorkflowTerminalFailure | undefined,
  t: (key: string, params?: Record<string, unknown>) => string,
): string {
  if (failure?.code === 'RATE_LIMITED') {
    const kind = failure.details?.limitKind ?? 'unknown';
    const message = t(
      `aiAssistant.businessSurface.${kind === 'quota_exhausted' ? 'quotaExhausted' : kind === 'rate_limit' ? 'rateLimited' : 'limitUnknown'}`,
    );
    return failure.retryHint?.kind === 'after'
      ? `${message} ${t('aiAssistant.businessSurface.retryAfter', { seconds: Math.ceil(failure.retryHint.afterMs / 1000) })}`
      : message;
  }
  return getAIErrorMessage(
    failure ?? {
      code: 'AI_WORKFLOW_RUNTIME_ERROR',
      message: 'Workflow failed',
    },
    t,
    'aiAssistant.errors.workflowExecutionFailed',
  );
}

export function getGoalWorkflowInterruptionMessage(
  interruption: NonNullable<ChatItem['workflowInterruption']>,
  t: (key: string, params?: Record<string, unknown>) => string,
): string {
  return [
    t(
      `aiAssistant.businessSurface.${interruption.confirmation === 'unconfirmed' ? 'interruptionUnconfirmed' : 'interrupted'}`,
    ),
    ...(interruption.requestedModel
      ? [
          t('aiAssistant.businessSurface.selectedModelContext', {
            model: interruption.requestedModel.name,
            provider: interruption.requestedModel.provider,
          }),
        ]
      : []),
    getAIWorkflowTerminalFailureMessage(interruption.failure, t),
    ...(interruption.draftPreserved ? [t('aiAssistant.businessSurface.draftPreserved')] : []),
  ].join('\n\n');
}

/**
 * Convert a workflow execution failure into stable public UI text.
 *
 * `failure.message` may originate from a repository/provider/runtime boundary,
 * so the presentation layer deliberately exposes only the product translation
 * plus the stable failure code. Raw backend messages never become UI copy.
 */
export function getAIWorkflowFailureMessage(
  failure: Pick<AIWorkflowExecutionFailure, 'code'>,
  t: (key: string) => string,
): string {
  const fallback = t('aiAssistant.errors.workflowExecutionFailed');
  const code = failure.code.trim();
  return code ? `${fallback} (${code})` : fallback;
}

/** Shared native request observation for Settings and Composer; never upstream diagnostics. */
export function getNativeAgentExecutionFailureMessage(
  failure: LocalAgentExecutionFailure | undefined,
  t: (key: string, params?: Record<string, unknown>) => string,
): string {
  return failure
    ? `${t('aiAssistant.local.lastRequestFailed', { model: failure.modelId })} ${t(`errors.${failure.code}`)}`
    : '';
}
