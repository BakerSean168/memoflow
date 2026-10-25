/**
 * Domain errors for Goal value objects
 */

import { ResultErrorException } from '@memoflow/contracts/result';

export class InvalidWeightError extends ResultErrorException {
  constructor(field: string, value: number) {
    super(
      `Invalid weight value for ${field}: ${value}. Must be between 0 and 100.`,
      'VALIDATION_ERROR',
      undefined,
      { field, value },
      422,
    );
  }
}
