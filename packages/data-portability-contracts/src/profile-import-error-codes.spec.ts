import { describe, expect, it } from 'vitest';
import {
  PROFILE_IMPORT_ERROR_CODES,
  ProfileImportErrorCodeSchema,
  type ProfileImportErrorCode,
} from './profile-import';

const newCodes: ProfileImportErrorCode[] = [
  'IMPORT_ARCHIVE_REQUIRED',
  'IMPORT_ARCHIVE_MISMATCH',
  'IMPORT_ARCHIVE_UNAVAILABLE',
  'IMPORT_VERIFICATION_FAILED',
  'IMPORT_LIMIT_EXCEEDED',
];

describe('Profile import error codes', () => {
  it('keeps the existing codes and appends the archive/verification/limit codes', () => {
    expect(PROFILE_IMPORT_ERROR_CODES).toEqual([
      'TARGET_UNAVAILABLE',
      'TARGET_NOT_EMPTY',
      'TARGET_UNKNOWN',
      'TARGET_CHANGED',
      'IMPORT_REQUEST_CONFLICT',
      'IMPORT_NOT_COMMITTED',
      'IMPORT_PREFLIGHT_REQUIRED',
      'IMPORT_NOT_FOUND',
      ...newCodes,
    ]);
  });

  it('accepts every declared code and rejects unknown codes', () => {
    for (const code of PROFILE_IMPORT_ERROR_CODES) {
      expect(ProfileImportErrorCodeSchema.parse(code)).toBe(code);
    }
    expect(ProfileImportErrorCodeSchema.safeParse('IMPORT_UNKNOWN').success).toBe(false);
  });
});
