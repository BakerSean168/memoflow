/**
 * Prisma Error Mapper
 *
 * Maps PrismaClientKnownRequestError codes to standardised Result error codes
 * so that catch blocks never leak raw Prisma messages to the frontend.
 *
 * This module deliberately does NOT import `@prisma/client` — it detects Prisma
 * errors by checking the constructor name and the `code` property pattern,
 * keeping `@memoflow/utils` free of a hard Prisma dependency.
 */

// ============================================================================
// Types
// ============================================================================

export interface PrismaErrorMapping {
  /** ResultCode compatible string (e.g. 'CONFLICT', 'NOT_FOUND') */
  resultCode: string;
  /** HTTP status code */
  httpStatus: number;
  /** Safe, generic message to send to the client */
  message: string;
}

// ============================================================================
// Helpers
// ============================================================================

/** Regex that matches Prisma error codes like "P2002", "P2025", etc. */
const PRISMA_CODE_RE = /^P\d{4}$/;

/**
 * Check whether an unknown value looks like a PrismaClientKnownRequestError.
 *
 * We intentionally use duck-typing instead of `instanceof` so that
 * `@memoflow/utils` does not depend on `@prisma/client`.
 */
export function isPrismaError(
  err: unknown,
): err is Error & { code: string; meta?: Record<string, unknown> } {
  if (!(err instanceof Error)) return false;
  const code = (err as unknown as Record<string, unknown>).code;
  return typeof code === 'string' && PRISMA_CODE_RE.test(code);
}

/**
 * Check whether an unknown value is a Prisma unique-constraint violation (P2002).
 *
 * Idempotent insert paths (seed scripts, upsert fallbacks) use this instead of
 * comparing provider codes themselves, keeping Prisma vocabulary inside the
 * error mapper (ADR-049 provider ACL).
 */
export function isUniqueConstraintError(err: unknown): boolean {
  return isPrismaError(err) && err.code === 'P2002';
}

// ============================================================================
// Mapping
// ============================================================================

/**
 * Attempt to map a Prisma error to a safe Result error representation.
 *
 * Returns `null` when `err` is not a recognised Prisma error.
 *
 * @example
 * ```ts
 * const mapped = mapPrismaError(err);
 * if (mapped) {
 *   res.status(mapped.httpStatus).json(
 *     responseBuilder.error(mapped.resultCode, mapped.message),
 *   );
 * }
 * ```
 */
export function mapPrismaError(err: unknown): PrismaErrorMapping | null {
  if (!isPrismaError(err)) return null;

  switch (err.code) {
    // Unique constraint violation
    case 'P2002':
      return {
        resultCode: 'CONFLICT',
        httpStatus: 409,
        message: 'Resource already exists',
      };

    // Record not found (for update / delete)
    case 'P2025':
      return {
        resultCode: 'NOT_FOUND',
        httpStatus: 404,
        message: 'Resource not found',
      };

    // Foreign key constraint violation
    case 'P2003':
      return {
        resultCode: 'BAD_REQUEST',
        httpStatus: 400,
        message: 'Referenced resource does not exist',
      };

    // Required field missing / null constraint violation
    case 'P2011':
      return {
        resultCode: 'VALIDATION_ERROR',
        httpStatus: 422,
        message: 'A required field is missing',
      };

    // Value too long for column type
    case 'P2000':
      return {
        resultCode: 'VALIDATION_ERROR',
        httpStatus: 422,
        message: 'A field value exceeds the maximum allowed length',
      };

    // Default — all other Prisma codes → generic 500
    default:
      return {
        resultCode: 'INTERNAL_ERROR',
        httpStatus: 500,
        message: 'Database operation failed',
      };
  }
}
