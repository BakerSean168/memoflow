/**
 * Locale checks for the unverified-email shell banner (P2). The banner's high-contrast
 * token classes are a governance source lock (app-vue-source-locks.json#unverified-email-banner).
 */
import { describe, expect, it } from 'vitest';
import zhCN from '../../locales/zh-CN';
import enUS from '../../locales/en-US';

function resolveMsg(messages: Record<string, unknown>, key: string): unknown {
  let cur: unknown = messages;
  for (const part of key.split('.')) {
    if (cur == null || typeof cur !== 'object' || !(part in (cur as object))) {
      return undefined;
    }
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

describe('unverified email banner', () => {
  it('has translated banner copy in zh-CN and en-US', () => {
    const zhBanner = resolveMsg(zhCN as Record<string, unknown>, 'shell.auth.unverifiedBanner');
    const enBanner = resolveMsg(enUS as Record<string, unknown>, 'shell.auth.unverifiedBanner');
    const zhAction = resolveMsg(zhCN as Record<string, unknown>, 'shell.auth.unverifiedAction');
    const enAction = resolveMsg(enUS as Record<string, unknown>, 'shell.auth.unverifiedAction');
    expect(typeof zhBanner).toBe('string');
    expect(typeof enBanner).toBe('string');
    expect(typeof zhAction).toBe('string');
    expect(typeof enAction).toBe('string');
    expect(String(zhBanner)).not.toContain('shell.auth');
    expect(String(enBanner).toLowerCase()).toMatch(/email|verif/);
  });
});
