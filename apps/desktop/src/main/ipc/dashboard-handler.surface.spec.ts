import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DashboardChannels } from '@memoflow/contracts/electron';

/**
 * Dashboard IPC surface (stage-6 residual):
 * Handler registers via contracts DashboardChannels — no string dual-track channel name.
 */
describe('dashboard-handler channel surface', () => {
  const source = readFileSync(resolve(__dirname, 'dashboard-handler.ts'), 'utf8');

  it('registers via DashboardChannels.GET_STATS', () => {
    expect(source).toContain('DashboardChannels');
    expect(source).toContain("from '@memoflow/contracts/electron'");
    expect(source).toContain('DashboardChannels.GET_STATS');
    expect(source).not.toContain("'dashboard:get-stats'");
    expect(DashboardChannels.GET_STATS).toBe('dashboard:get-stats');
  });
});

/**
 * Step 4 repository-accessor retirement surface:
 * after the desktop composers inject instance-bound repository views, no
 * `@memoflow/goal/electron` / `@memoflow/task/electron` repository accessor
 * imports may remain anywhere in apps/desktop/src (the shims were removed from
 * the package electron seams in Step 4).
 *
 * Step 4 repository-accessor 退役表面契约：desktop composer 注入 instance-bound
 * repository view 后，apps/desktop/src 中不得再残留任何
 * `@memoflow/goal/electron` / `@memoflow/task/electron` repository accessor
 * 导入（Step 4 已从包 electron seam 移除这些 shim）。
 */
describe('desktop goal/task repository accessor retirement surface', () => {
  const mainDir = resolve(__dirname, '..');
  const files = [
    'main.ts',
    'ipc/dashboard-handler.ts',
    'services/dashboard-read-service.ts',
    'modules/ai/desktop-analytics-read.adapter.ts',
    'runtime/compose-ai.ts',
  ];

  for (const file of files) {
    it(`${file} does not import goal/task electron repository accessors`, () => {
      const source = readFileSync(resolve(mainDir, file), 'utf8');
      expect(source).not.toMatch(/\bgetGoalRepository\b/);
      expect(source).not.toMatch(/\bgetGoalRecordRepository\b/);
      expect(source).not.toMatch(/\bgetTaskPlanRepository\b/);
      expect(source).not.toMatch(/\bgetTaskOccurrenceRepository\b/);
    });
  }

  it('keeps the retired desktop automation executor physically deleted', () => {
    expect(existsSync(resolve(mainDir, 'modules/ai/desktop-automation-tool-executor.adapter.ts'))).toBe(
      false,
    );
  });

  it('wires goal/task workflow mutations through canonical application ports', () => {
    const source = readFileSync(resolve(mainDir, 'runtime/compose-ai.ts'), 'utf8');
    expect(source).toContain('GoalApplicationPort');
    expect(source).toContain('TaskApplicationPort');
    expect(source).toContain('DesktopGoalPlanMutationAdapter');
    expect(source).toContain('DesktopTaskPlanMutationAdapter');
    expect(source).not.toContain('desktop-automation-tool-executor.adapter');
  });
});
