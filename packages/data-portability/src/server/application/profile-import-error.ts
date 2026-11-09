import type { ProfileImportErrorCode } from '@memoflow/data-portability-contracts';
import { ResultErrorException } from '@memoflow/transport-contracts/result';

export type { ProfileImportErrorCode } from '@memoflow/data-portability-contracts';

export class ProfileImportError extends ResultErrorException {
  constructor(code: ProfileImportErrorCode) {
    super(
      code,
      code,
      undefined,
      undefined,
      code === 'IMPORT_NOT_FOUND'
        ? 404
        : code === 'TARGET_UNKNOWN' || code === 'TARGET_UNAVAILABLE'
          ? 503
          : code === 'IMPORT_LIMIT_EXCEEDED'
            ? 413
            : 409,
    );
  }
}
