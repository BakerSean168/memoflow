import { describe, expect, it } from 'vitest';
import { AccountStatus } from '../account-status';
import { GenderType } from '../gender-type';

describe('Account domain value objects', () => {
  it('validates and classifies account statuses', () => {
    expect(AccountStatus.of('Active')).toBe(AccountStatus.Active);
    expect(AccountStatus.getAll()).toEqual([AccountStatus.Active, AccountStatus.Closed]);
    expect(AccountStatus.canLogin(AccountStatus.Active)).toBe(true);
    expect(AccountStatus.canLogin(AccountStatus.Closed)).toBe(false);
    expect(AccountStatus.isClosed(AccountStatus.Closed)).toBe(true);
    expect(() => AccountStatus.of('Archived')).toThrow('Invalid account status: Archived');
  });

  it('classifies gender values', () => {
    expect(GenderType.of('Male')).toBe(GenderType.Male);
    expect(GenderType.isSpecified(GenderType.PreferNotToSay)).toBe(false);
    expect(GenderType.isSpecified(GenderType.Other)).toBe(true);
    expect(GenderType.getAll()).toContain(GenderType.Female);
  });
});
