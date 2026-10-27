import type { ResultError, StructuredResultError } from '@memoflow/transport-contracts/result';
import { extractStructuredResultError } from '@memoflow/transport-contracts/result';
import { createDiagnosticFailure, type MappedResultFailure } from './diagnostic-failure';
import { mapPrismaError } from './prisma-error-mapper';

function withoutCause(error: StructuredResultError): StructuredResultError {
  const { cause: _cause, ...publicError } = error;
  return publicError;
}

/**
 * Map an unknown error into a safe public error plus internal-only diagnostics.
 *
 * New boundary code should use this function, record the diagnostic through the
 * owning observer/logger, and return only `publicError` to callers.
 */
export function mapInfraErrorToFailure(
  error: unknown,
  fallbackMessage = 'Operation failed',
  operation = 'unknown',
): MappedResultFailure {
  const structured = extractStructuredResultError(error);
  if (structured) {
    return {
      publicError: withoutCause(structured),
      diagnostic:
        structured.cause === undefined
          ? undefined
          : createDiagnosticFailure({
              operation,
              cause: structured.cause,
              attributes:
                structured.statusCode === undefined
                  ? undefined
                  : { statusCode: structured.statusCode },
            }),
    };
  }

  const prismaMapping = mapPrismaError(error);
  if (prismaMapping) {
    return {
      publicError: {
        code: prismaMapping.resultCode,
        message: prismaMapping.message,
        statusCode: prismaMapping.httpStatus,
      },
      diagnostic: createDiagnosticFailure({
        operation,
        cause: error,
        provider: 'prisma',
        providerCode:
          typeof error === 'object' && error !== null && 'code' in error
            ? String(error.code)
            : undefined,
      }),
    };
  }

  return {
    publicError: {
      code: 'INTERNAL_ERROR',
      message: fallbackMessage,
      statusCode: 500,
    },
    diagnostic: createDiagnosticFailure({ operation, cause: error }),
  };
}

/**
 * Legacy mapper preserving the existing ResultError-with-cause behavior.
 *
 * New code must prefer {@link mapInfraErrorToFailure}. This compatibility wrapper
 * remains until all legacy call sites explicitly record diagnostics.
 */
export function mapInfraErrorToResultError(
  error: unknown,
  fallbackMessage = 'Operation failed',
): ResultError {
  const mapped = mapInfraErrorToFailure(error, fallbackMessage);
  return {
    ...mapped.publicError,
    cause: mapped.diagnostic?.cause,
  };
}
