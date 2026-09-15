import { describe, it, expect } from 'vitest';
import { Account } from '../account';
import { AccountStatus } from '../../value-objects/account-status';
import { IdentityId } from '@memoflow/domain-shared/shared';
import { asInstant } from '@memoflow/time';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CREATED_AT = asInstant(1_700_000_000_000);
const PROFILE_UPDATED_AT = asInstant(1_700_000_000_100);
const CLOSED_AT = asInstant(1_700_000_000_200);

function anAccount(overrides: { nicknameSeed?: string } = {}) {
  return Account.create({
    id: IdentityId.generate(),
    nicknameSeed: overrides.nicknameSeed ?? 'TestUser',
    now: CREATED_AT,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Account', () => {
  // =========================================================================
  // create
  // =========================================================================
  describe('create', () => {
    it('should create an account with ACTIVE status', () => {
      const account = anAccount();
      expect(account.status).toBe(AccountStatus.Active);
    });

    it('should set default profile from the product nickname seed', () => {
      const account = anAccount({ nicknameSeed: 'John Doe' });
      expect(account.profile.nickname).toBe('John Doe');
    });

    it('uses the explicit creation Instant for createdAt and updatedAt', () => {
      const account = anAccount();
      expect(account.createdAt).toBe(CREATED_AT);
      expect(account.updatedAt).toBe(CREATED_AT);
    });

    it('should set closedAt to null', () => {
      const account = anAccount();
      expect(account.closedAt).toBeNull();
    });

    it('should emit account:create domain event', () => {
      const account = anAccount();
      const events = account.domainEvents;
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('account:created');
      expect(events[0].payload.accountId).toBe(account.id.toString());
      expect(events[0].payload.account.profile.nickname).toBe(account.profile.nickname);
    });
  });

  // =========================================================================
  // load
  // =========================================================================
  describe('load', () => {
    it('should reconstruct from saved state', () => {
      const original = anAccount({ nicknameSeed: 'Loaded User' });
      // Simulate persistence round-trip
      const loaded = Account.load({
        id: original.id as any,
        profile: original.profile,
        status: original.status,
        createdAt: original.createdAt,
        updatedAt: original.updatedAt,
        closedAt: original.closedAt,
      });
      expect(loaded.profile.nickname).toBe('Loaded User');
      expect(loaded.domainEvents).toHaveLength(0); // no events on load
    });
  });

  // =========================================================================
  // close
  // =========================================================================
  describe('close', () => {
    it('should change status to CLOSED', () => {
      const account = anAccount();
      account.close(CLOSED_AT);
      expect(account.status).toBe(AccountStatus.Closed);
    });

    it('should emit account:close domain event', () => {
      const account = anAccount();
      account.clearDomainEvents(); // clear the create event
      account.close(CLOSED_AT);
      const events = account.domainEvents;
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('account:closed');
      expect(events[0].payload.accountId).toBe(account.id.toString());
      expect(events[0].payload.account.status).toBe(AccountStatus.Closed);
    });

    it('should throw if already deactivated', () => {
      const account = anAccount();
      account.close(CLOSED_AT);
      expect(() => account.close(CLOSED_AT)).toThrow('Account is already closed.');
    });

    it('should persist an explicit closedAt lifecycle fact', () => {
      const account = anAccount();
      expect(account.closedAt).toBeNull();
      account.close(CLOSED_AT);
      expect(account.closedAt).not.toBeNull();
      expect(account.closedAt).toBe(account.updatedAt);
    });

    it('should update the updatedAt timestamp', () => {
      const account = anAccount();
      const before = account.updatedAt;
      // Small delay to ensure timestamp difference
      account.close(CLOSED_AT);
      expect(Number(account.updatedAt)).toBeGreaterThanOrEqual(Number(before));
    });
  });

  // =========================================================================
  // updateProfile
  // =========================================================================
  describe('updateProfile', () => {
    it('should replace profile with a new one', () => {
      const account = anAccount({ nicknameSeed: 'Update User' });
      const newProfile = account.profile.updateNickname('NewName');
      account.updateProfile(newProfile, PROFILE_UPDATED_AT);
      expect(account.profile.nickname).toBe('NewName');
    });

    it('should emit account:update-profile domain event', () => {
      const account = anAccount();
      account.clearDomainEvents();
      const newProfile = account.profile.updateNickname('Updated');
      account.updateProfile(newProfile, PROFILE_UPDATED_AT);
      const events = account.domainEvents;
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('account:profile-updated');
      expect(events[0].payload.account.profile.nickname).toBe('Updated');
    });

    it('uses the explicit mutation Instant for updatedAt', () => {
      const account = anAccount();
      const newProfile = account.profile.updateBio('Hello');
      account.updateProfile(newProfile, PROFILE_UPDATED_AT);
      expect(account.updatedAt).toBe(PROFILE_UPDATED_AT);
    });
  });

  // =========================================================================
  // pullDomainEvents
  // =========================================================================
  describe('pullDomainEvents', () => {
    it('should return and clear domain events', () => {
      const account = anAccount();
      expect(account.domainEvents).toHaveLength(1);
      const pulled = account.pullDomainEvents();
      expect(pulled).toHaveLength(1);
      expect(account.domainEvents).toHaveLength(0);
    });
  });

  // =========================================================================
  // serialization
  // =========================================================================
  describe('toServerDTO', () => {
    it('should serialize all fields', () => {
      const account = anAccount({ nicknameSeed: 'DTO User' });
      const dto = account.toServerDTO();
      expect(dto.id).toBeDefined();
      expect(dto.status).toBe(AccountStatus.Active);
      expect(dto.profile).toBeDefined();
      expect(dto.profile.nickname).toBe('DTO User');
      expect(typeof dto.createdAt).toBe('number');
      expect(typeof dto.updatedAt).toBe('number');
      expect(dto.closedAt).toBeNull();
    });
  });

  describe('toClientDTO', () => {
    it('should serialize all fields same as server DTO', () => {
      const account = anAccount();
      const serverDTO = account.toServerDTO();
      const clientDTO = account.toClientDTO();
      expect(clientDTO).toEqual(serverDTO);
    });
  });
});
