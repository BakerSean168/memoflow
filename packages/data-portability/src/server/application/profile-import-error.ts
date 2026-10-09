import { ResultErrorException } from '@memoflow/contracts/result';

export type ProfileImportErrorCode =
  | 'TARGET_UNAVAILABLE'
  | 'TARGET_NOT_EMPTY'
  | 'TARGET_UNKNOWN'
  | 'TARGET_CHANGED'
  | 'IMPORT_REQUEST_CONFLICT'
  | 'IMPORT_NOT_COMMITTED'
  | 'IMPORT_PREFLIGHT_REQUIRED'
  | 'IMPORT_NOT_FOUND';

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
          : 409,
    );
  }
}
