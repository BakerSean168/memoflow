import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import enUS from './en-US';
import zhCN from './zh-CN';

const localeAwareSurfaces = [
  'src/modules/schedule/components/CreateScheduleDialog.vue',
  'src/modules/task/components/TaskPlanForm/sections/ReminderSection.vue',
  'src/modules/task/components/TaskPlanForm/sections/RecurrenceSection.vue',
  'src/modules/task/components/TaskPlanForm/sections/TimeConfigSection.vue',
  'src/modules/goal/views/GoalDetailView.vue',
  'src/modules/notification/views/SSEMonitorPage.vue',
];

describe('locale-aware date presentation', () => {
  it.each(localeAwareSurfaces)('%s binds date formatting to the active locale', (relativePath) => {
    const source = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), '../..', relativePath),
      'utf8',
    );

    expect(source).not.toMatch(/\.toLocale(?:Date|Time)?String\(\s*(?:\)|undefined\s*,)/);
    if (source.includes("'yyyy-MM-dd EEEE'")) {
      expect(source).toContain("locale: locale.value.startsWith('zh') ? zhCN : enUS");
    }
  });

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
