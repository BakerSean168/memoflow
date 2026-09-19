import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('date input product-time boundary', () => {
  const dir = __dirname;
  const vueAi = readFileSync(
    resolve(dir, '../../modules/ai/components/AIGoalDraftEditor.vue'),
    'utf8',
  );
  const goalDialog = readFileSync(
    resolve(dir, '../../modules/goal/components/dialogs/GoalDialog.vue'),
    'utf8',
  );
  const vueTask = readFileSync(
    resolve(dir, '../../modules/task/components/TaskPlanForm/sections/TimeConfigSection.vue'),
    'utf8',
  );

  it('keeps Goal start dates on Product Time and broad targets on GoalTimeframe', () => {
    expect(goalDialog).toContain('GoalTimeframePicker');
    expect(goalDialog).toContain('toProductYmdInputValue');
    expect(goalDialog).toContain('fromProductYmdInputValue');
    expect(vueAi).toContain('toProductYmdInputValue');
    expect(vueAi).toContain('fromProductYmdInputValue');
    expect(vueAi).toContain('goalTimeframeLabel');

    for (const source of [vueAi, goalDialog]) {
      expect(source).not.toContain('getTimezoneOffset');
      expect(source).not.toContain('toISOString().slice');
      expect(source).not.toMatch(/function toDateInputValue\b/);
    }
  });

  it('keeps Task date input on the canonical Ymd calendar boundary', () => {
    expect(vueTask).toContain('TaskPlanScheduleSchema');
    expect(vueTask).toContain('parseToCalendarDate');
    expect(vueTask).toContain('handleCalendarSelect');
    expect(vueTask).not.toContain('new Date(');
    expect(vueTask).not.toContain('getTimezoneOffset');
    expect(vueTask).not.toContain('toISOString().slice');
  });
});
