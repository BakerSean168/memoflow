import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('date input product-time boundary', () => {
  const dir = __dirname;
  const vueAi = readFileSync(resolve(dir, '../../modules/ai/components/AIGoalDraftEditor.vue'), 'utf8');
  const goalDialog = readFileSync(resolve(dir, '../../modules/goal/components/dialogs/GoalDialog.vue'), 'utf8');
  const vueTask = readFileSync(
    resolve(dir, '../../modules/task/components/TaskPlanForm/sections/TimeConfigSection.vue'),
    'utf8',
  );

  it('uses Product Time input helpers for Goal date editors', () => {
    for (const source of [vueAi, goalDialog]) {
      expect(source).toContain('toProductDateInputValue');
      expect(source).toContain('fromProductDateInputValue');
      expect(source).not.toContain('getTimezoneOffset');
      expect(source).not.toContain('toISOString().slice');
    }
    expect(vueAi).not.toMatch(/function toDateInputValue\b/);
  });

  it('keeps Task date input on the same Product Time facade', () => {
    expect(vueTask).toContain('getProductTime');
    expect(vueTask).toContain('dateValue');
    expect(vueTask).not.toContain('getTimezoneOffset');
  });
});
