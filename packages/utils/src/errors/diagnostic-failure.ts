import type { StructuredResultError } from '@memoflow/transport-contracts/result';
import type { ILogger } from '../logger/types';

/** Internal-only failure diagnostics. Never use this type in HTTP, IPC, SSE, or durable contracts. */
export interface DiagnosticFailure {
  readonly operation: string;
  readonly cause?: unknown;
  readonly provider?: string;
  readonly providerCode?: string;
  readonly attributes?: Readonly<Record<string, unknown>>;
}

/** Safe public error paired with optional internal diagnostics. */
export interface MappedResultFailure {
  readonly publicError: StructuredResultError;
  readonly diagnostic?: DiagnosticFailure;
}

/** Create an internal diagnostic record without changing the public error contract. */
export function createDiagnosticFailure(input: DiagnosticFailure): DiagnosticFailure {
  return Object.freeze({
    ...input,
    attributes: input.attributes ? Object.freeze({ ...input.attributes }) : undefined,
  });
}

/**
 * Record a diagnostic failure once at the boundary that owns the mapping.
 *
 * Callers decide whether an expected public failure should be logged. This helper does
 * not serialize the diagnostic object and keeps provider detail outside public results.
 */
export function recordDiagnosticFailure(logger: ILogger, diagnostic: DiagnosticFailure): void {
  logger.error(`Operation failed: ${diagnostic.operation}`, diagnostic.cause, {
    ...diagnostic.attributes,
    operation: diagnostic.operation,
    provider: diagnostic.provider,
    providerCode: diagnostic.providerCode,
  });
}
