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

  it('explains external package-manager upgrades in both locales', () => {
    expect(enSetting.updates.description.availablePackageManager).toContain('package manager');
    expect(zhSetting.updates.description.availablePackageManager).toContain('系统包管理器');
  });

  it('names Nightly and describes the active release channel without implying Stable', () => {
    expect(enSetting.updates.channel.nightly).toBe('Nightly');
    expect(zhSetting.updates.channel.nightly).toBe('每夜构建版');
    expect(enSetting.updates.description.readyToCheck).toContain('current release channel');
    expect(enSetting.updates.description.upToDate).toContain('its release channel');
    expect(zhSetting.updates.description.readyToCheck).toContain('当前更新通道');
    expect(zhSetting.updates.description.upToDate).toContain('所选更新通道');
    expect(enSetting.updates.description.readyToCheck).not.toContain('stable');
    expect(enSetting.updates.description.upToDate).not.toContain('stable');
    expect(zhSetting.updates.description.readyToCheck).not.toContain('稳定');
    expect(zhSetting.updates.description.upToDate).not.toContain('稳定');
  });

  it('keeps every About & Updates leaf key symmetric across en-US and zh-CN', () => {
    expect(flattenKeys(enSetting.updates.troubleshooting)).toContain('receiptStatus');
    expect(flattenKeys(enSetting.updates).sort()).toEqual(flattenKeys(zhSetting.updates).sort());
  });
});
