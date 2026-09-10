import { describe, it, expect } from 'vitest';
import { AccountProfile } from '../account-profile';
import { GenderType } from '../gender-type';
import type { AccountProfileDTO } from '@memoflow/contracts/account';
import { requireYmd } from '@memoflow/contracts/primitives';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function aProfileDTO(overrides: Partial<AccountProfileDTO> = {}): AccountProfileDTO {
  return {
    nickname: 'TestUser',
    gender: GenderType.PreferNotToSay,
    realName: null,
    avatarUrl: null,
    bio: null,
    birthday: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AccountProfile', () => {
  // =========================================================================
  // create
  // =========================================================================
  describe('create', () => {
    it('should create a profile with valid props', () => {
      const profile = AccountProfile.create(aProfileDTO());
      expect(profile.nickname).toBe('TestUser');
      expect(profile.gender).toBe(GenderType.PreferNotToSay);
    });

    it('should reject nickname shorter than 2 characters', () => {
      expect(() => AccountProfile.create(aProfileDTO({ nickname: 'A' }))).toThrow(
        'Nickname must be at least 2 characters',
      );
    });

    it('should reject nickname longer than 20 characters', () => {
      expect(() => AccountProfile.create(aProfileDTO({ nickname: 'A'.repeat(21) }))).toThrow(
        'Nickname must be under 20 characters',
      );
    });

    it('should accept nickname exactly 2 characters', () => {
      const profile = AccountProfile.create(aProfileDTO({ nickname: 'AB' }));
      expect(profile.nickname).toBe('AB');
    });

    it('should accept nickname exactly 20 characters', () => {
      const profile = AccountProfile.create(aProfileDTO({ nickname: 'A'.repeat(20) }));
      expect(profile.nickname).toBe('A'.repeat(20));
    });

    it('should reject invalid gender type', () => {
      expect(() => AccountProfile.create(aProfileDTO({ gender: 'INVALID' as any }))).toThrow(
        'Invalid gender type',
      );
    });

    it('should reject an impossible birthday instead of coercing an epoch/date', () => {
      expect(() =>
        AccountProfile.create(
          aProfileDTO({ birthday: '2025-02-29' as AccountProfileDTO['birthday'] }),
        ),
      ).toThrow('Invalid calendar date');
    });
  });

  // =========================================================================
  // createDefault
  // =========================================================================
  describe('createDefault', () => {
    it('uses a product display-name seed directly', () => {
      const profile = AccountProfile.createDefault('John Doe');
      expect(profile.nickname).toBe('John Doe');
    });

    it('truncates a long display-name seed to the Account nickname limit', () => {
      const profile = AccountProfile.createDefault('A'.repeat(30));
      expect(profile.nickname).toBe('A'.repeat(20));
    });

    it('uses a neutral fallback for an unusably short seed', () => {
      const profile = AccountProfile.createDefault('A');
      expect(profile.nickname).toBe('User');
    });

    it('sets default gender and optional fields without auth-derived data', () => {
      const profile = AccountProfile.createDefault('Test User');
      expect(profile.gender).toBe(GenderType.PreferNotToSay);
      expect(profile.realName).toBeNull();
      expect(profile.avatarUrl).toBeNull();
      expect(profile.bio).toBeNull();
      expect(profile.birthday).toBeNull();
    });
  });

  // =========================================================================
  // update methods (immutable - each returns a new instance)
  // =========================================================================
  describe('updateNickname', () => {
    it('should return a new profile with updated nickname', () => {
      const original = AccountProfile.create(aProfileDTO({ nickname: 'OldName' }));
      const updated = original.updateNickname('NewName');
      expect(updated.nickname).toBe('NewName');
      expect(original.nickname).toBe('OldName');
    });

    it('should validate the new nickname', () => {
      const profile = AccountProfile.create(aProfileDTO());
      expect(() => profile.updateNickname('A')).toThrow('Nickname must be at least 2 characters');
    });
  });

  describe('updateAvatar', () => {
    it('should return a new profile with updated avatar URL', () => {
      const profile = AccountProfile.create(aProfileDTO());
      const updated = profile.updateAvatar('https://example.com/avatar.png');
      expect(updated.avatarUrl).toBe('https://example.com/avatar.png');
      expect(profile.avatarUrl).toBeNull();
    });
  });

  describe('updateBio', () => {
    it('should return a new profile with updated bio', () => {
      const profile = AccountProfile.create(aProfileDTO());
      const updated = profile.updateBio('Hello world');
      expect(updated.bio).toBe('Hello world');
    });

    it('should reject bio longer than 500 characters', () => {
      const profile = AccountProfile.create(aProfileDTO());
      expect(() => profile.updateBio('X'.repeat(501))).toThrow('Bio too long');
    });

    it('should accept bio exactly 500 characters', () => {
      const profile = AccountProfile.create(aProfileDTO());
      const updated = profile.updateBio('X'.repeat(500));
      expect(updated.bio).toBe('X'.repeat(500));
    });
  });

  describe('setRealName', () => {
    it('should return a new profile with real name set', () => {
      const profile = AccountProfile.create(aProfileDTO());
      const updated = profile.setRealName('John Doe');
      expect(updated.realName).toBe('John Doe');
    });
  });

  describe('updateGender', () => {
    it('should return a new profile with updated gender', () => {
      const profile = AccountProfile.create(aProfileDTO());
      const updated = profile.updateGender(GenderType.Male);
      expect(updated.gender).toBe(GenderType.Male);
    });
  });

  describe('setBirthday', () => {
    it('should return a new profile with birthday set as Ymd', () => {
      const profile = AccountProfile.create(aProfileDTO());
      const updated = profile.setBirthday(requireYmd('2000-01-01'), requireYmd('2026-09-09'));
      expect(updated.birthday).toBe('2000-01-01');
    });

    it('should reject future birthday', () => {
      const profile = AccountProfile.create(aProfileDTO());
      expect(() => profile.setBirthday(requireYmd('2026-09-10'), requireYmd('2026-09-09'))).toThrow(
        'Birthday cannot be in the future',
      );
    });
  });

  // =========================================================================
  // computed properties
  // =========================================================================
  describe('displayName', () => {
    it('should return realName when set', () => {
      const profile = AccountProfile.create(aProfileDTO({ realName: 'John Doe' }));
      expect(profile.displayName).toBe('John Doe');
    });

    it('should return nickname when realName is null', () => {
      const profile = AccountProfile.create(aProfileDTO({ realName: null }));
      expect(profile.displayName).toBe('TestUser');
    });
  });

  describe('getAgeAt', () => {
    it('should return null when birthday is not set', () => {
      const profile = AccountProfile.create(aProfileDTO());
      expect(profile.getAgeAt(requireYmd('2026-09-09'))).toBeNull();
    });

    it('should calculate age correctly', () => {
      const profile = AccountProfile.create(aProfileDTO({ birthday: requireYmd('2006-09-10') }));
      expect(profile.getAgeAt(requireYmd('2026-09-09'))).toBe(19);
      expect(profile.getAgeAt(requireYmd('2026-09-10'))).toBe(20);
    });
  });

  // =========================================================================
  // serialization
  // =========================================================================
  describe('toDTO', () => {
    it('should return a plain object with all props', () => {
      const props = aProfileDTO({ nickname: 'Serialized' });
      const profile = AccountProfile.create(props);
      const dto = profile.toDTO();
      expect(dto).toEqual(props);
    });
  });

  // =========================================================================
  // value object equality
  // =========================================================================
  describe('equals', () => {
    it('should consider two profiles with same props as equal', () => {
      const a = AccountProfile.create(aProfileDTO());
      const b = AccountProfile.create(aProfileDTO());
      expect(a.equals(b)).toBe(true);
    });

    it('should consider profiles with different nicknames as not equal', () => {
      const a = AccountProfile.create(aProfileDTO({ nickname: 'Alice' }));
      const b = AccountProfile.create(aProfileDTO({ nickname: 'Bobby' }));
      expect(a.equals(b)).toBe(false);
    });
  });
});
