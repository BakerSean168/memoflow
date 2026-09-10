import { describe, expect, it } from 'vitest';
import { AccountPrismaMapper } from './account-prisma.mapper';

const validProfile = {
  nickname: 'Ada',
  realName: null,
  avatarUrl: null,
  bio: null,
  gender: 'PreferNotToSay',
  birthday: null,
};

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'IdentityId_00000000-0000-4000-8000-000000000001',
    status: 'Active',
    profile: validProfile,
    createdAt: new Date(1_700_000_000_000),
    updatedAt: new Date(1_700_000_000_123),
    closedAt: null,
    ...overrides,
  } as never;
}

describe('AccountPrismaMapper.toDomain timestamps', () => {
  it.each([
    ['createdAt', { createdAt: null }],
    ['createdAt', { createdAt: undefined }],
    ['createdAt', { createdAt: new Date('invalid') }],
    ['updatedAt', { updatedAt: null }],
    ['updatedAt', { updatedAt: undefined }],
    ['updatedAt', { updatedAt: new Date('invalid') }],
  ])('fails closed when %s is missing or invalid', (_field, override) => {
    expect(() => AccountPrismaMapper.toDomain(row(override))).toThrow(/Account timestamp/);
  });

  it('maps persisted Dates to exact epoch Instants', () => {
    const account = AccountPrismaMapper.toDomain(row());

    expect(account.createdAt).toBe(1_700_000_000_000);
    expect(account.updatedAt).toBe(1_700_000_000_123);
  });
});
