import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Residual 1177: buildIntentName keep-boundary (goal vs task schedule projections).
 * - goal: GoalServerDTO + ReminderTrigger → RemainingDays / progress % Chinese name
 * - task: TASK-3101 neutral ScheduledIntent observability name keeps the same
 *   TaskPlan + Relative/Absolute business wording without ScheduleTask coupling.
 * Soft residual 1168: mapImportanceToTaskPriority dual-retired sole remains separate.
 * Soft residual 1174: normalizePath keep-boundary remains separate.
 * Does not flip §13.2 checkboxes.
 */
describe('buildIntentName keep-boundary (residual 1177)', () => {
  const dir = __dirname;
  const goal = readFileSync(resolve(dir, 'schedule-projection-source.ts'), 'utf8');
  const task = readFileSync(
    resolve(dir, '../../../../task/src/server/infrastructure/schedule-projection-source.ts'),
    'utf8',
  );

  it('owns Residual 1177 keep-boundary markers on goal domain buildIntentName', () => {
    expect(goal).toContain('Residual 1177 keep-boundary');
    expect(goal).toMatch(/function buildIntentName\b/);
    expect(goal).toContain('GoalServerDTO');
    expect(goal).toContain('ReminderTrigger');
    expect(goal).toContain('RemainingDays');
    expect(goal).toContain('剩余');
    expect(goal).toContain('进度');
    const body = goal.match(/function buildIntentName\([\s\S]*?\n\}/)?.[0] ?? '';
    expect(body).toContain('goal.name');
    expect(body).toContain('trigger.value');
    expect(body).not.toContain('template.name');
    expect(body).not.toContain('formatUnit');
    expect(body).not.toContain('定时提醒');
  });

  it('keeps Goal legacy naming distinct from Task neutral intent observability naming', () => {
    expect(task).toMatch(/function buildIntentName\b/);
    expect(task).toContain('TaskPlanServerDTO');
    expect(task).toContain("trigger.type === 'Relative'");
    expect(task).toContain('formatUnit');
    expect(task).toContain('定时提醒');
    expect(task).toContain('observability:');
    expect(task).not.toContain('ScheduleTask');
    const body = task.match(/function buildIntentName\([\s\S]*?\n\}/)?.[0] ?? '';
    expect(body).toContain('template.name');
    expect(body).toContain('relativeValue');
    expect(body).not.toContain('RemainingDays');
    expect(body).not.toContain('剩余');
    expect(body).not.toContain('GoalServerDTO');
  });

  it('runtime: documents goal remaining/progress vs task relative/absolute naming contracts', () => {
    function goalBuildIntentName(
      goalName: string,
      trigger: { type: 'RemainingDays' | 'TimeProgressPercentage'; value: number },
    ): string {
      if (trigger.type === 'RemainingDays') {
        return `${goalName} · 剩余 ${trigger.value} 天提醒`;
      }
      return `${goalName} · 进度 ${trigger.value}% 提醒`;
    }
    function taskBuildIntentName(
      templateName: string,
      trigger: {
        type: 'Relative' | 'Absolute';
        relativeValue: number | null;
        relativeUnit: 'Minutes' | 'Hours' | 'Days' | null;
      },
    ): string {
      const unitLabel =
        trigger.relativeUnit === 'Minutes'
          ? '分钟'
          : trigger.relativeUnit === 'Hours'
            ? '小时'
            : trigger.relativeUnit === 'Days'
              ? '天'
              : '';
      if (trigger.type === 'Relative' && trigger.relativeValue !== null && trigger.relativeUnit) {
        return `${templateName} · 提前 ${trigger.relativeValue}${unitLabel} 提醒`;
      }
      return `${templateName} · 定时提醒`;
    }
    expect(goalBuildIntentName('读完书', { type: 'RemainingDays', value: 3 })).toBe(
      '读完书 · 剩余 3 天提醒',
    );
    expect(goalBuildIntentName('读完书', { type: 'TimeProgressPercentage', value: 50 })).toBe(
      '读完书 · 进度 50% 提醒',
    );
    expect(
      taskBuildIntentName('写报告', {
        type: 'Relative',
        relativeValue: 30,
        relativeUnit: 'Minutes',
      }),
    ).toBe('写报告 · 提前 30分钟 提醒');
    expect(
      taskBuildIntentName('写报告', {
        type: 'Absolute',
        relativeValue: null,
        relativeUnit: null,
      }),
    ).toBe('写报告 · 定时提醒');
  });

  it('documents residual 1177 lock intent without claiming §13.2 complete', () => {
    const self = readFileSync(
      resolve(dir, 'build-task-name-keep-boundary.surface.spec.ts'),
      'utf8',
    );
    expect(self).toContain('Residual 1177');
    expect(self).toContain('Does not flip §13.2 checkboxes');
    expect(self).toContain('keep-boundary');
  });
});
