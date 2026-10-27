import {
  ResultErrorException,
  unwrapOrThrowError,
  type Result,
  type ResultErrorDetail,
} from '@memoflow/transport-contracts/result';

export { ResultErrorException as ResultClientError };

export async function createResultClientErrorFromResponse(
  response: Response,
  fallbackMessage: string,
): Promise<ResultErrorException> {
  const parsed = await tryParseJson(response);
  const message =
    readString(parsed, 'error.message') ?? readString(parsed, 'message') ?? fallbackMessage;
  const code = readString(parsed, 'error.code') ?? readString(parsed, 'code') ?? 'INTERNAL_ERROR';
  const details = readDetails(parsed);

  return new ResultErrorException(message, code, details, undefined, response.status);
}

export function createResultClientError(
  message: string,
  code: string,
  statusCode?: number,
  details?: ResultErrorDetail[],
): ResultErrorException {
  return new ResultErrorException(message, code, details, undefined, statusCode);
}

export function unwrapResultOrThrow<T>(result: Result<T>): T {
  return unwrapOrThrowError(result);
}

async function tryParseJson(response: Response): Promise<unknown> {
  try {
    return await response.clone().json();
  } catch {
    return null;
  }
}

/**
 * Residual 1171 keep-boundary: Result client error readString — dotted path + non-empty string only.
 * Soft residual 1171: API response-builder readString is single-key and allows empty strings (no force-merge).
 */
function readString(value: unknown, path: string): string | undefined {
  const result = readPath(value, path);
  return typeof result === 'string' && result.length > 0 ? result : undefined;
}

function readDetails(value: unknown): ResultErrorDetail[] | undefined {
  const result = readPath(value, 'error.details');
  return Array.isArray(result) ? (result as ResultErrorDetail[]) : undefined;
}

function readPath(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (!current || typeof current !== 'object') {
      return undefined;
    }

    return (current as Record<string, unknown>)[segment];
  }, value);
}
