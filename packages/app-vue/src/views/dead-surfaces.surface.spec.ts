import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { goalRoutes } from '../modules/goal/router';
import { accountRoutes } from '../modules/account/router';

const sourceRoot = resolve(__dirname, '..');
const read = (path: string) => readFileSync(resolve(sourceRoot, path), 'utf8');

describe('retired public render surfaces', () => {
  it('keeps KR/Review deep links on the canonical Goal entity workspace', () => {
    const children = goalRoutes[0].children!;
    const detail = children.find((route) => route.name === 'goal-detail')!;
    for (const name of ['goal-review-create', 'goal-review-detail', 'key-result-detail']) {
      expect(children.find((route) => route.name === name)?.component).toBe(detail.component);
    }
    expect(
      accountRoutes[0].children?.find((route) => route.name === 'account-center')?.redirect,
    ).toEqual({ path: '/settings', query: { tab: 'account' } });
  });

  it('does not publish mock-only Account/Schedule recipes or the duplicate GoalRecord alias', () => {
    for (const [owner, names] of [
      ['account', ['ProfileCard', 'ProfileForm']],
      [
        'schedule',
        ['ConflictAlert', 'ScheduleConflictAlert', 'ScheduleEventList', 'ScheduleFormDemo'],
      ],
    ] as const) {
      const barrel = read(`modules/${owner}/components/index.ts`);
      for (const name of names) {
        expect(barrel).not.toContain(`as ${name} `);
        expect(existsSync(resolve(sourceRoot, `modules/${owner}/components/${name}.vue`))).toBe(
          false,
        );
        expect(
          existsSync(resolve(sourceRoot, `modules/${owner}/components/${name}.stories.ts`)),
        ).toBe(false);
      }
    }
    expect(read('modules/goal/components/index.ts')).not.toContain('GoalRecordCardFromCards');
    expect(existsSync(resolve(sourceRoot, 'modules/task/components/index.ts'))).toBe(false);
    expect(read('modules/task/components/types.ts')).not.toContain('EditableTaskUI');
    expect(existsSync(resolve(sourceRoot, 'modules/task/components/TaskAIGenerationDialog.vue'))).toBe(false);
    expect(
      existsSync(resolve(sourceRoot, 'shared/utils/format-schedule-duration-minutes.ts')),
    ).toBe(false);
  });
});
