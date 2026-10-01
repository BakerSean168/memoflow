import { describe, expect, it } from 'vitest';
import enSetting from './en-US/setting';
import zhSetting from './zh-CN/setting';

function flattenKeys(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return prefix ? [prefix] : [];
  }

  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    flattenKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe('Desktop Update settings locale symmetry', () => {
  it('keeps the updates group label in both supported settings locales', () => {
    expect(enSetting.groups.updates).toBe('About & Updates');
    expect(zhSetting.groups.updates).toBe('关于与更新');
  });

  it('keeps every About & Updates leaf key symmetric across en-US and zh-CN', () => {
    expect(flattenKeys(enSetting.updates.troubleshooting)).toContain('receiptStatus');
    expect(flattenKeys(enSetting.updates).sort()).toEqual(flattenKeys(zhSetting.updates).sort());
  });
});
