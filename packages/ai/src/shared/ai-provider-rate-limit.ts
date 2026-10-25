import {
  AIRateLimitPublicFailureSchema,
  type AIWorkflowTerminalFailure,
} from '@memoflow/contracts/ai';

type LimitMetadata = Pick<AIWorkflowTerminalFailure, 'details' | 'retryHint'>;
const MAX_DELAY_MS = 86_400_000;

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function retryDelay(value: unknown, duration = false): LimitMetadata['retryHint'] {
  if (typeof value !== 'string' || value.length > 32) return undefined;
  const match = (duration ? /^(\d+(?:\.\d{1,9})?)s$/ : /^(\d+(?:\.\d+)?)$/).exec(value.trim());
  if (!match) return undefined;
  const afterMs = Math.ceil(Number(match[1]) * 1000);
  return Number.isSafeInteger(afterMs) && afterMs >= 0 && afterMs <= MAX_DELAY_MS
    ? { kind: 'after', afterMs }
    : undefined;
}

/** Provider-private structured parsing; messages, quota identifiers and bodies never leave this seam. */
export function readAIProviderRateLimit(error: unknown): LimitMetadata {
  const seen = new Set<unknown>();
  let current = error;
  for (let depth = 0; depth < 5; depth++) {
    const candidate = record(current);
    if (!candidate || seen.has(current)) break;
    seen.add(current);
    const canonical = AIRateLimitPublicFailureSchema.safeParse(candidate.failure);
    if (canonical.success)
      return {
        ...(canonical.data.details ? { details: canonical.data.details } : {}),
        ...(canonical.data.retryHint ? { retryHint: canonical.data.retryHint } : {}),
      };
    if (candidate.statusCode === 429) {
      let body: unknown = candidate.data;
      if (typeof candidate.responseBody === 'string' && candidate.responseBody.length <= 32_768) {
        try {
          body = JSON.parse(candidate.responseBody);
        } catch {
          /* No text-based classification. */
        }
      }
      const provider = record(record(body)?.error);
      let limitKind: NonNullable<LimitMetadata['details']>['limitKind'] | undefined;
      if (provider?.code === 'insufficient_quota' || provider?.type === 'insufficient_quota')
        limitKind = 'quota_exhausted';
      else if (provider?.code === 'rate_limit_exceeded') limitKind = 'rate_limit';
      let retryHint = retryDelay(record(candidate.responseHeaders)?.['retry-after']);
      const details = Array.isArray(provider?.details) ? provider.details.slice(0, 16) : [];
      for (const value of details) {
        const detail = record(value);
        if (detail?.['@type'] === 'type.googleapis.com/google.rpc.RetryInfo')
          retryHint = retryDelay(detail.retryDelay, true) ?? retryHint;
        if (
          detail?.['@type'] === 'type.googleapis.com/google.rpc.QuotaFailure' &&
          Array.isArray(detail.violations)
        ) {
          for (const value of detail.violations.slice(0, 16)) {
            const violation = record(value);
            // Quota value zero and daily quota IDs cannot be resolved by a short backoff.
            if (
              violation?.quotaValue === '0' ||
              violation?.quotaValue === 0 ||
              (typeof violation?.quotaId === 'string' && violation.quotaId.includes('PerDay'))
            )
              limitKind = 'quota_exhausted';
            else if (
              limitKind !== 'quota_exhausted' &&
              typeof violation?.quotaId === 'string' &&
              violation.quotaId.includes('PerMinute')
            )
              limitKind = 'rate_limit';
          }
        }
      }
      return {
        ...(limitKind ? { details: { limitKind } } : {}),
        ...(retryHint ? { retryHint } : {}),
      };
    }
    current = candidate.lastError ?? candidate.cause;
  }
  return {};
}
