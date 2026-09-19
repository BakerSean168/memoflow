import { toAIPublicFailure } from '../../../shared/ai-public-failure';

/**
 * Project a mutation failure before it becomes durable workflow state.
 *
 * Workflow receipts and suspensions cross HTTP/IPC boundaries later, so they
 * must not retain provider, database, or adapter diagnostics. Retryability is
 * still decided by the caller from the original structured error.
 */
export function toWorkflowFailure(
  error: unknown,
  fallbackMessage = 'AI workflow operation failed',
): { code: string; message: string } {
  const failure = toAIPublicFailure(error, {
    fallbackCode: 'INTERNAL_ERROR',
    fallbackMessage,
  });
  return { code: failure.code, message: failure.message };
}
