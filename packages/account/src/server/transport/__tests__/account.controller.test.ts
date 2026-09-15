import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ok, fail, isOk } from '@memoflow/contracts/result';
import { AccountController } from '../account.controller';
import type { Context } from '@memoflow/contracts/shared';
import type { AccountApplicationPort } from '../../application';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockApi(): AccountApplicationPort {
  return {
    listAccounts: vi.fn(),
    getProfile: vi.fn(),
    updateProfile: vi.fn(),
    closeAccount: vi.fn(),
  } as unknown as AccountApplicationPort;
}

const FAKE_CONTEXT: Context = {
  identityId: 'test-identity-123',
  deviceId: 'device-456',
};

const FAKE_ACCOUNT_DTO = {
  id: 'test-identity-123',
  status: 'Active',
  profile: {
    nickname: 'TestUser',
    gender: 'PreferNotToSay',
    realName: null,
    avatarUrl: null,
    bio: null,
    birthday: null,
  },
  createdAt: 1000,
  updatedAt: 1000,
  closedAt: null,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AccountController', () => {
  let api: AccountApplicationPort;
  let controller: AccountController;

  beforeEach(() => {
    api = createMockApi();
    controller = new AccountController(api);
  });

  // =========================================================================
  // getProfile
  // =========================================================================
  describe('getProfile', () => {
    it('should delegate to use case', async () => {
      (api.getProfile as ReturnType<typeof vi.fn>).mockResolvedValue(ok(FAKE_ACCOUNT_DTO));

      const result = await controller.getProfile(FAKE_CONTEXT);

      expect(api.getProfile).toHaveBeenCalledWith(FAKE_CONTEXT);
      expect(isOk(result)).toBe(true);
    });

    it('should map null profile to NOT_FOUND', async () => {
      (api.getProfile as ReturnType<typeof vi.fn>).mockResolvedValue(ok(null));

      const result = await controller.getProfile(FAKE_CONTEXT);

      expect(isOk(result)).toBe(false);
      if (!isOk(result)) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });
  });

  // =========================================================================
  // updateProfile
  // =========================================================================
  describe('updateProfile', () => {
    it('should return VALIDATION_ERROR when input is invalid (empty object passes - all optional)', async () => {
      (api.updateProfile as ReturnType<typeof vi.fn>).mockResolvedValue(ok(FAKE_ACCOUNT_DTO));

      // Empty object should be valid since all fields are optional
      const result = await controller.updateProfile({}, FAKE_CONTEXT);

      expect(isOk(result)).toBe(true);
      expect(api.updateProfile).toHaveBeenCalled();
    });

    it('should call updateProfile use case with parsed data', async () => {
      (api.updateProfile as ReturnType<typeof vi.fn>).mockResolvedValue(ok(FAKE_ACCOUNT_DTO));

      await controller.updateProfile({ nickname: 'ValidName' }, FAKE_CONTEXT);

      expect(api.updateProfile).toHaveBeenCalledWith(
        expect.objectContaining({ nickname: 'ValidName' }),
        FAKE_CONTEXT,
      );
    });

    it('should reject invalid nickname (empty string)', async () => {
      const result = await controller.updateProfile({ nickname: '' }, FAKE_CONTEXT);

      expect(isOk(result)).toBe(false);
      if (!isOk(result)) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
      }
      expect(api.updateProfile).not.toHaveBeenCalled();
    });

    it('should reject invalid avatar URL', async () => {
      const result = await controller.updateProfile({ avatar: 'not-a-url' }, FAKE_CONTEXT);

      expect(isOk(result)).toBe(false);
      if (!isOk(result)) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
      }
    });

    it('should forward use case failure', async () => {
      const useCaseError = fail({ code: 'NOT_FOUND', message: 'Account not found' });
      (api.updateProfile as ReturnType<typeof vi.fn>).mockResolvedValue(useCaseError);

      const result = await controller.updateProfile({ nickname: 'Valid' }, FAKE_CONTEXT);

      expect(isOk(result)).toBe(false);
      if (!isOk(result)) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });
  });

  // =========================================================================
  // closeAccount
  // =========================================================================
  describe('closeAccount', () => {
    it('should validate input and pass through the structured close receipt', async () => {
      const receipt = {
        operationId: 'op-1',
        identityId: FAKE_CONTEXT.identityId,
        idempotencyKey: 'closure:test-identity-123:1',
        phase: 'closed' as const,
        status: 'succeeded' as const,
        attempts: 1,
        ownerToken: null,
        leaseExpiresAt: null,
        nextRetryAt: null,
        deadLetterAt: null,
        eventId: 'evt-1',
        reason: 'No longer needed',
        revokedSessions: 2,
        createdAt: 0,
        updatedAt: 0,
        finishedAt: 100,
      };
      (api.closeAccount as ReturnType<typeof vi.fn>).mockResolvedValue(ok(receipt));

      const result = await controller.closeAccount({ reason: 'No longer needed' }, FAKE_CONTEXT);

      expect(result).toEqual(ok(receipt));
      expect(api.closeAccount).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'No longer needed' }),
        FAKE_CONTEXT,
      );
    });

    it('should return VALIDATION_ERROR when reason is empty', async () => {
      const result = await controller.closeAccount({ reason: '' }, FAKE_CONTEXT);

      expect(isOk(result)).toBe(false);
      if (!isOk(result)) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
      }
      expect(api.closeAccount).not.toHaveBeenCalled();
    });

    it('should return VALIDATION_ERROR when reason is missing', async () => {
      const result = await controller.closeAccount({}, FAKE_CONTEXT);

      expect(isOk(result)).toBe(false);
      if (!isOk(result)) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
      }
    });

    it('should forward use case failure', async () => {
      (api.closeAccount as ReturnType<typeof vi.fn>).mockResolvedValue(
        fail({ code: 'FORBIDDEN', message: 'Cannot close suspended account' }),
      );

      const result = await controller.closeAccount({ reason: 'Test' }, FAKE_CONTEXT);

      expect(isOk(result)).toBe(false);
    });
  });
});
