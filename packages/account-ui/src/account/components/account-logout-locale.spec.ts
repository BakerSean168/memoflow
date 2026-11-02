import { describe, expect, it } from 'vitest';
import enUS from '@account-ui-test-host/locales/en-US';
import zhCN from '@account-ui-test-host/locales/zh-CN';

function keyPaths(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    keyPaths(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe('account logout production locale contract', () => {
  it.each([
    ['en-US', enUS],
    ['zh-CN', zhCN],
  ])('provides translated confirmation dialog labels for %s', (_locale, messages) => {
    expect(messages.account.actions.logout).not.toMatch(/^account\./);
    expect(messages.account.logoutConfirm.title).not.toMatch(/^account\./);
    expect(messages.account.logoutConfirm.description).not.toMatch(/^account\./);
    expect(messages.account.logoutConfirm.confirmText).not.toMatch(/^account\./);
    expect(messages.account.logoutConfirm.cancelText).not.toMatch(/^account\./);
  });

  it.each([
    ['en-US', enUS],
    ['zh-CN', zhCN],
  ])('provides translated 退出账号 copy for %s', (_locale, messages) => {
    expect(messages.account.signOut.action).not.toMatch(/^account\./);
    expect(messages.account.signOut.hint).not.toMatch(/^account\./);
    for (const scope of ['local', 'registered'] as const) {
      expect(messages.account.signOut.confirm[scope].title).not.toMatch(/^account\./);
      expect(messages.account.signOut.confirm[scope].description).not.toMatch(/^account\./);
    }
  });

  it('keeps the two sign-out confirmations semantically distinct', () => {
    expect(zhCN.account.signOut.confirm.local.description).not.toBe(
      zhCN.account.signOut.confirm.registered.description,
    );
    expect(enUS.account.signOut.confirm.local.description).not.toBe(
      enUS.account.signOut.confirm.registered.description,
    );
  });

  it('keeps the signOut key set in parity across locales', () => {
    expect(keyPaths(enUS.account.signOut).sort()).toEqual(keyPaths(zhCN.account.signOut).sort());
  });
});
