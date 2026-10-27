import { describe, expect, it } from 'vitest';
import enUS from '@account-ui-test-host/locales/en-US';
import zhCN from '@account-ui-test-host/locales/zh-CN';

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
});
