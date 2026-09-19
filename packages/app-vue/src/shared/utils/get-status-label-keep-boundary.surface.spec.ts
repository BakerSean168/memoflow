import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('status presentation ownership', () => {
  const dir = __dirname;
  const goalDetail = readFileSync(
    resolve(dir, '../../modules/goal/views/GoalDetailView.vue'),
    'utf8',
  );
  const goalRow = readFileSync(
    resolve(dir, '../../modules/goal/components/GoalProgressRow.vue'),
    'utf8',
  );


  it('keeps Goal lifecycle status presentation local without resurrecting Draft/Archived mapping logic', () => {
    expect(goalDetail).toContain('goal.status');
    expect(goalRow).toContain('goal.list.pastTarget');
    expect(goalRow).toContain("props.goal.status === 'Completed'");
    expect(goalRow).toContain("props.goal.status === 'Abandoned'");
    for (const source of [goalDetail, goalRow]) {
      expect(source).not.toMatch(/getStatusLabel\b/);
      expect(source).not.toContain('goal.cards.goalStatus.draft');
      expect(source).not.toContain('goal.cards.goalStatus.archived');
    }
  });
});
