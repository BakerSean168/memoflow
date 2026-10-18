import { describe, expect, it } from 'vitest';
import enUS from './en-US';
import zhCN from './zh-CN';

// Locale-bound date formatting on feature surfaces is a governance source lock
// (tools/governance/app-vue-source-locks.json#localePresentation).
describe('locale-aware date presentation', () => {
  it('uses product language for key-result types and goal impact presets', () => {
    expect(zhCN.goal.krDialog.valueTypeIncremental).toBe('累积值');
    expect(zhCN.goal.krDialog.valueTypeAbsolute).toBe('里程碑');
    expect(zhCN.goal.krDialog.valueTypeBinary).toBe('是/否');
    expect(zhCN.goal.krDialog.impactMedium).toBe('中影响');

    expect(enUS.goal.krDialog.valueTypeIncremental).toBe('Cumulative value');
    expect(enUS.goal.krDialog.valueTypeAbsolute).toBe('Milestone');
    expect(enUS.goal.krDialog.valueTypeBinary).toBe('Yes / No');
    expect(enUS.goal.krDialog.impactMedium).toBe('Medium impact');
  });
});
