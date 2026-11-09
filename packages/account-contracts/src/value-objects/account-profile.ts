/**
 * 个人资料信息
 *
 * ADR-037 W5: birthday is a calendar day (`Ymd`), not midnight Date / epoch Instant.
 */

import type { Ymd } from '@memoflow/shared-primitives';

import type { GenderType } from './gender-type';

/** Nickname invariant shared by the domain value object and portable/write schemas. */
export const ACCOUNT_NICKNAME_MIN_LENGTH = 2;
export const ACCOUNT_NICKNAME_MAX_LENGTH = 20;

/** Same neutral fallback `AccountProfile.createDefault` uses for an unusable seed. */
export const DEFAULT_ACCOUNT_NICKNAME = 'User';

/**
 * Coerce a persisted or client-supplied nickname into the domain invariant.
 *
 * Legacy rows and untrusted sync uploads can contain null/undefined or an
 * out-of-range string. Normalizing here keeps the stored-data contract intact
 * while ensuring domain construction never dereferences a non-string.
 */
export function normalizeAccountNickname(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_ACCOUNT_NICKNAME;
  if (value.length > ACCOUNT_NICKNAME_MAX_LENGTH) {
    return value.slice(0, ACCOUNT_NICKNAME_MAX_LENGTH);
  }
  if (value.length < ACCOUNT_NICKNAME_MIN_LENGTH) return DEFAULT_ACCOUNT_NICKNAME;
  return value;
}

export interface AccountProfile {
  nickname: string;
  realName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  gender: GenderType;
  /** Local calendar day of birth (YYYY-MM-DD), not an Instant. */
  birthday: Ymd | null;
}

export interface AccountProfileDTO {
  nickname: string;
  realName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  gender: GenderType;
  /** Canonical wire birthday is a calendar day, never an epoch Instant. */
  birthday: Ymd | null;
}
