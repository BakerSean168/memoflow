export type AIExecutionErrorKind =
  | 'aborted'
  | 'timeout'
  | 'unauthorized'
  | 'rate_limited'
  | 'structured_output'
  | 'not_found'
  | 'validation'
  | 'model_not_available'
  | 'configuration_required'
  | 'capability_unsupported'
  | 'capability_unverified'
  | 'provider_unavailable'
  | 'upstream_provider_error'
  | 'transport'
  | 'conflict'
  | 'internal';

/**
 * AI-owned structured execution failure. It carries machine-readable semantics
 * across AI application/runtime boundaries while keeping provider text diagnostic-only.
 */
export class AIExecutionError extends Error {
  readonly category: AIExecutionErrorKind;
  readonly requestId?: string;
  readonly statusCode?: number;

  constructor(
    category: AIExecutionErrorKind,
    message: string,
    options: { requestId?: string; statusCode?: number; cause?: unknown } = {},
  ) {
    super(message);
    if (options.cause !== undefined) Object.assign(this, { cause: options.cause });
    this.name = 'AIExecutionError';
    this.category = category;
    this.requestId = options.requestId;
    this.statusCode = options.statusCode;
  }
}

export function isAIExecutionError(error: unknown): error is AIExecutionError {
  return error instanceof AIExecutionError;
}

export function toAIExecutionError(
  error: unknown,
  fallback: {
    category: AIExecutionErrorKind;
    message: string;
    requestId?: string;
    statusCode?: number;
  },
): AIExecutionError {
  if (error instanceof AIExecutionError) return error;
  if (error instanceof Error && error.name === 'AbortError') {
    return new AIExecutionError('aborted', 'AI execution was aborted', {
      requestId: fallback.requestId,
      cause: error,
    });
  }
  return new AIExecutionError(fallback.category, fallback.message, {
    requestId: fallback.requestId,
    statusCode: fallback.statusCode,
    cause: error,
  });
}
