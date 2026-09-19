import { extractStructuredResultError } from '@memoflow/contracts/result';
import { isAIExecutionError, type AIExecutionErrorKind } from './ai-execution-error';

/** Public AI failure codes accepted at the runtime boundary. */
export const AI_PUBLIC_FAILURE_CODES = [
  'RATE_LIMITED',
  'PROVIDER_AUTH_FAILED',
  'MODEL_NOT_AVAILABLE',
  'AI_CONFIGURATION_REQUIRED',
  'AI_CAPABILITY_UNSUPPORTED',
  'AI_CAPABILITY_UNVERIFIED',
  'TIMEOUT',
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'CANCELED',
  'SERVICE_UNAVAILABLE',
  'CONFLICT',
  'INTERNAL_ERROR',
  'AI_RUNTIME_TRANSPORT_ERROR',
  'AI_RUNTIME_ERROR',
  'AI_WORKFLOW_RUNTIME_ERROR',
] as const;

export type AIPublicFailureCode = (typeof AI_PUBLIC_FAILURE_CODES)[number];

export interface AIPublicFailureContext {
  readonly requestId: string;
}

export interface AIPublicFailure {
  readonly code: string;
  readonly message: string;
  readonly context?: AIPublicFailureContext;
}

export interface AIPublicFailureOptions {
  readonly fallbackCode: string;
  readonly fallbackMessage: string;
}

const AI_PUBLIC_FAILURE_CODE_SET = new Set<string>(AI_PUBLIC_FAILURE_CODES);

/**
 * Project AI failures onto the transport-neutral, stable public contract.
 * Provider/runtime diagnostics remain internal; only a safe requestId may be
 * projected from structured context.
 */
export function toAIPublicFailure(
  error: unknown,
  options: AIPublicFailureOptions,
): AIPublicFailure {
  if (isAIExecutionError(error)) {
    const code = mapAIExecutionCategory(error.category);
    return createPublicFailure(
      code,
      safeAIPublicMessage(code),
      error.requestId ? { requestId: error.requestId } : undefined,
    );
  }

  const structured = extractStructuredResultError(error);
  if (structured && isAIPublicFailureCode(structured.code)) {
    const code = structured.code;
    return createPublicFailure(code, safeAIPublicMessage(code), structured.context);
  }

  return createPublicFailure(options.fallbackCode, options.fallbackMessage, structured?.context);
}

function createPublicFailure(code: string, message: string, context: unknown): AIPublicFailure {
  const requestContext = projectRequestId(context);
  return {
    code,
    message,
    ...(requestContext ? { context: requestContext } : {}),
  };
}

function projectRequestId(context: unknown): AIPublicFailureContext | undefined {
  if (typeof context !== 'object' || context === null || Array.isArray(context)) {
    return undefined;
  }
  const requestId = (context as { requestId?: unknown }).requestId;
  if (typeof requestId !== 'string') return undefined;
  const normalized = requestId.trim();
  return normalized ? { requestId: normalized } : undefined;
}

function isAIPublicFailureCode(value: string): value is AIPublicFailureCode {
  return AI_PUBLIC_FAILURE_CODE_SET.has(value);
}

function mapAIExecutionCategory(category: AIExecutionErrorKind): AIPublicFailureCode {
  switch (category) {
    case 'rate_limited':
      return 'RATE_LIMITED';
    case 'unauthorized':
      return 'PROVIDER_AUTH_FAILED';
    case 'model_not_available':
      return 'MODEL_NOT_AVAILABLE';
    case 'configuration_required':
      return 'AI_CONFIGURATION_REQUIRED';
    case 'capability_unsupported':
      return 'AI_CAPABILITY_UNSUPPORTED';
    case 'capability_unverified':
      return 'AI_CAPABILITY_UNVERIFIED';
    case 'timeout':
      return 'TIMEOUT';
    case 'validation':
    case 'structured_output':
      return 'VALIDATION_ERROR';
    case 'not_found':
      return 'NOT_FOUND';
    case 'aborted':
      return 'CANCELED';
    case 'provider_unavailable':
    case 'upstream_provider_error':
    case 'transport':
      return 'SERVICE_UNAVAILABLE';
    case 'conflict':
      return 'CONFLICT';
    case 'internal':
      return 'INTERNAL_ERROR';
  }
}

function safeAIPublicMessage(code: AIPublicFailureCode): string {
  switch (code) {
    case 'RATE_LIMITED':
      return 'AI provider rate limit exceeded';
    case 'PROVIDER_AUTH_FAILED':
      return 'AI provider authentication failed';
    case 'MODEL_NOT_AVAILABLE':
      return 'AI model is not available';
    case 'TIMEOUT':
      return 'AI request timed out';
    case 'VALIDATION_ERROR':
      return 'AI response validation failed';
    case 'NOT_FOUND':
      return 'AI resource was not found';
    case 'CANCELED':
      return 'AI request was canceled';
    case 'SERVICE_UNAVAILABLE':
      return 'AI service is unavailable';
    case 'AI_CONFIGURATION_REQUIRED':
      return 'AI provider and model configuration is required';
    case 'AI_CAPABILITY_UNSUPPORTED':
      return 'The selected AI model does not support the required capability';
    case 'AI_CAPABILITY_UNVERIFIED':
      return 'The selected AI model capability has not been verified';
    case 'CONFLICT':
      return 'AI operation conflicts with current state';
    case 'INTERNAL_ERROR':
      return 'AI request failed';
    case 'AI_RUNTIME_TRANSPORT_ERROR':
    case 'AI_RUNTIME_ERROR':
      return 'AI runtime request failed';
    case 'AI_WORKFLOW_RUNTIME_ERROR':
      return 'Workflow failed';
  }
}
