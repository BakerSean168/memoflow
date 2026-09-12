import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Goal desktop runtime composer surface.
 * 目标 desktop runtime composer 表面契约。
 *
 * Locks the Step 4 wiring: apps/desktop/src/main/main.ts must compose goal
 * through the runtime composer and must no longer reference the retired
 * `createGoalElectronModule` transport factory or the `@memoflow/goal/electron`
 * seam. The composer must only touch the narrow seams the plan allows.
 *
 * 锁定 Step 4 接线：apps/desktop/src/main/main.ts 必须通过 runtime composer 组装目标，
 * 且不再引用已退役的 `createGoalElectronModule` transport 工厂或
 * `@memoflow/goal/electron` seam。composer 只允许接触计划允许的窄 seam。
 */
describe('goal desktop runtime composer surface', () => {
  const dir = resolve(__dirname, '..');
  const main = readFileSync(resolve(dir, 'main.ts'), 'utf8');
  const composer = readFileSync(resolve(__dirname, 'compose-goal.ts'), 'utf8');

  it('main.ts composes goal with Task binding and canonical UserTimeContext ports', () => {
    expect(main).toContain("from './runtime/compose-goal'");
    expect(main).toMatch(
      /composeGoal\(\{\s*db,\s*taskBindingReadPort: new PowerSyncTaskBindingReadPort\(db\),\s*userTimeContextPort: settingElectronModule\.userTimeContextPort,\s*relationCleanupFactory: \(tx\) => new PowerSyncGoalRelationCleanupCapability\(tx\),?\s*\}/,
    );
    expect(main).toContain('.register(goalComposed.module)');
  });

  it('main.ts no longer references createGoalElectronModule or the goal/electron seam', () => {
    expect(main).not.toMatch(/\bcreateGoalElectronModule\b/);
    expect(main).not.toContain("from '@memoflow/goal/electron'");
  });

  it('composer selects PowerSync adapters and returns the module plus repository view', () => {
    expect(composer).toContain('interface ComposeGoalDependencies');
    expect(composer).toContain('createGoalPowerSyncRepositories');
    expect(composer).toContain('createGoalPowerSyncDeletionTransactionRunner');
    expect(composer).toContain('relationCleanupFactory');
    expect(composer).toContain('repositories');
    expect(composer).toContain("from '@memoflow/goal/electron'");
    expect(composer).not.toMatch(/@memoflow\/goal\/server/);
    expect(composer).not.toMatch(/@memoflow\/goal\/infrastructure/);
  });
});
