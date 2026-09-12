import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Residual 244: dashboard package does not dual-re-export contracts DTO types.
 * Consumers import DashboardData* from @memoflow/contracts/dashboard.
 */
describe('dashboard contracts export single-track surface', () => {
  const index = readFileSync(resolve(__dirname, 'index.ts'), 'utf8');

  it('exports projection and domain records only (no contracts convenience re-export)', () => {
    expect(index).toContain("export { getDashboardData } from './domain/projection'");
    expect(index).toContain('DashboardReadSource');
    expect(index).toContain('DashboardTaskOccurrenceRecord');
    expect(index).not.toContain('re-exported for convenience');
    expect(index).not.toContain("from '@memoflow/contracts/dashboard'");
    expect(index).not.toContain('export type { DashboardData }');
    expect(index).not.toContain('DashboardStats');
    expect(index).not.toContain('ActivityItem');
    expect(index).not.toContain('TrendDay');
    expect(index).not.toContain('GoalProgressItem');
    expect(index).not.toContain('TaskBoardSummary');
    expect(index).not.toContain('ScheduleItem');
  });
});
