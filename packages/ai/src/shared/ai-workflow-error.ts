import { AIRateLimitPublicFailureSchema } from '@memoflow/contracts/ai';
import type { PublicFailure } from '@memoflow/contracts/result';
import { toAIPublicFailure } from './ai-public-failure';

/** Only this safe projection may enter an engine's durable error snapshot. */
export class AIWorkflowPublicError extends Error {
  readonly code: string;
  readonly failure?: PublicFailure;

  constructor(error: unknown) {
    const publicError = toAIPublicFailure(error, {
      fallbackCode: 'AI_RUNTIME_TRANSPORT_ERROR',
      fallbackMessage: 'AI runtime request failed',
    });
    super(publicError.message);
    this.name = 'AIWorkflowPublicError';
    this.code = publicError.code;
    if (this.code === 'RATE_LIMITED')
      this.failure = AIRateLimitPublicFailureSchema.parse({
        code: this.code,
        category: 'rate_limited',
        details: publicError.details,
        retryHint: publicError.retryHint,
      });
    // No raw cause: Mastra serializes enumerable errors into durable snapshots.
  }
}
