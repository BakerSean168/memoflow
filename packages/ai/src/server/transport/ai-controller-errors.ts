import { errorCodeToHttpStatus, fail } from '@memoflow/contracts/result';
import { toAIPublicFailure, type AIPublicFailureOptions } from '../../shared/ai-public-failure';

export interface AITransportFailure {
  readonly code: string;
  readonly message: string;
  readonly statusCode: number;
  readonly context?: Record<string, unknown>;
}

export type AITransportFailureOptions = AIPublicFailureOptions;

export function toAIControllerFailure(error: unknown, fallbackMessage: string) {
  const failure = toAITransportFailure(error, {
    fallbackCode: 'INTERNAL_ERROR',
    fallbackMessage,
  });

  return fail({
    code: failure.code,
    message: failure.message,
    context: failure.context,
    cause: error,
  });
}

/**
 * Project AI execution failures onto the stable, secret-safe public transport
 * contract. The provider/runtime diagnostic message never crosses this seam.
 */
export function toAITransportFailure(
  error: unknown,
  options: AITransportFailureOptions,
): AITransportFailure {
  const failure = toAIPublicFailure(error, options);

  return {
    code: failure.code,
    message: failure.message,
    ...(failure.context ? { context: { requestId: failure.context.requestId } } : {}),
    statusCode: errorCodeToHttpStatus(failure.code),
  };
}
