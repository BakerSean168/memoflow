import type { Result } from '@memoflow/transport-contracts/result';
import { fail, ok } from '@memoflow/transport-contracts/result';
import { mapInfraErrorToResultError } from '../errors/result-error-mapper';

/**
 * Runs async work and converts thrown exceptions into Result failures.
 */
export async function resultify<T>(
  work: () => Promise<T>,
  fallbackMessage = 'Operation failed',
): Promise<Result<T>> {
  try {
    return ok(await work());
  } catch (error) {
    return fail(mapInfraErrorToResultError(error, fallbackMessage));
  }
}
