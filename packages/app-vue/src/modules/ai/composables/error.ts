import type { AIWorkflowExecutionFailure, AIWorkflowTerminalFailure } from '@memoflow/contracts/ai';
import { translateResultError } from '../../../shared/utils/translate-result-error';

export function getAIErrorMessage(error: unknown, t: (key: string) => string, fallbackKey: string) {
  return translateResultError(error, t, { fallbackKey });
}

/** Stable UI text for a terminal workflow failure; raw provider details stay server-side. */
export function getAIWorkflowTerminalFailureMessage(
  failure: AIWorkflowTerminalFailure | undefined,
  t: (key: string) => string,
): string {
  return getAIErrorMessage(
    failure ?? { code: 'AI_WORKFLOW_RUNTIME_ERROR', message: 'Workflow failed' },
    t,
    'aiAssistant.errors.workflowExecutionFailed',
  );
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
