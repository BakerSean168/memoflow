import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Data Portability API runtime composer surface.
 * 数据导出导入 API runtime composer 表面契约。
 *
 * Locks the Step C wiring: apps/api/src/server.ts must compose data-portability
 * through the runtime composer and must no longer reference the retired
 * `DataPortabilityApiModule` constant or the `@memoflow/data-portability/api`
 * seam. The composer must only touch the narrow seams the plan allows.
 *
 * 锁定 Step C 接线：apps/api/src/server.ts 必须通过 runtime composer 组装
 * data-portability，且不再引用已退役的 `DataPortabilityApiModule` 常量或
 * `@memoflow/data-portability/api` seam。composer 只允许接触计划允许的窄 seam。
 */
describe('data-portability API runtime composer surface', () => {
  const dir = resolve(__dirname, '..');
  const repoRoot = resolve(dir, '../../../');
  const server = readFileSync(resolve(dir, 'server.ts'), 'utf8');
  const composer = readFileSync(resolve(dir, 'runtime/compose-data-portability.ts'), 'utf8');

  it('server.ts composes data-portability with the stable owner V3 capabilities', () => {
    expect(server).toContain("from './runtime/compose-data-portability'");
    expect(server).toMatch(/composeDataPortability\(\{[\s\S]*?db: prisma,/);
    expect(server).toContain('accountApiModule.portableCapability');
    expect(server).toContain('settingApiModule.portableCapability');
    expect(server).toContain('notificationApiModule.module.portableCapability');
    expect(server).toContain('routineComposed.portableCapability');
    expect(server).toContain('scheduleApiModule.portableCapability');
    expect(server).toContain('notificationApiModule.portableFactCapability');
    expect(server).toContain('createLabelPortableCapability(labelService)');
    expect(server).toContain('goalComposed.portableCapability');
    expect(server).toContain('aiComposed.portableCapability');
    expect(server.match(/aiComposed\.portableCapability/g)).toHaveLength(1);
    expect(server).toContain('.register(dataPortabilityApiModule.module)');
  });

  it('keeps API and Desktop owner capability registration keys in the same deterministic order', () => {
    const desktop = readFileSync(
      resolve(dir, '../../desktop/src/main/main.ts'),
      'utf8',
    );
    const apiOrder = [
      'accountApiModule.portableCapability',
      'settingApiModule.portableCapability',
      'notificationApiModule.module.portableCapability',
      'routineComposed.portableCapability',
      'scheduleApiModule.portableCapability',
      'notificationApiModule.portableFactCapability',
      'createLabelPortableCapability(labelService)',
      'goalComposed.portableCapability',
      'taskComposed.portableCapability',
      'aiComposed.portableCapability',
    ];
    const desktopOrder = [
      'accountComposed.portableCapability',
      'settingElectronModule.portableCapability',
      'notificationComposed.module.portableCapability',
      'routineComposed.portableCapability',
      'scheduleComposed.portableCapability',
      'notificationComposed.portableFactCapability',
      'createLabelPortableCapability(labelService)',
      'goalComposed.portableCapability',
      'taskComposed.portableCapability',
      'aiComposed.portableCapability',
    ];
    const registrationBody = (source: string, first: string) =>
      source.slice(source.indexOf(first));
    const orderedIndexes = (source: string, entries: readonly string[]) =>
      entries.map((entry) => source.indexOf(entry));
    const apiIndexes = orderedIndexes(registrationBody(server, apiOrder[0]!), apiOrder);
    const desktopIndexes = orderedIndexes(
      registrationBody(desktop, desktopOrder[0]!),
      desktopOrder,
    );
    expect(apiIndexes.every((index) => index >= 0)).toBe(true);
    expect(desktopIndexes.every((index) => index >= 0)).toBe(true);
    expect(apiIndexes).toEqual([...apiIndexes].sort((a, b) => a - b));
    expect(desktopIndexes).toEqual([...desktopIndexes].sort((a, b) => a - b));
    expect(desktop.match(/aiComposed\.portableCapability/g)).toHaveLength(1);
  });

  it('matches the registered API/Desktop slots to the current owner key, version and dependency contracts', () => {
    const ownerContracts = [
      {
        path: 'packages/account/src/server/application/account-portability.ts',
        key: "readonly key = 'account-profile'",
        schemaVersion: 'readonly schemaVersion = 3',
        dependsOn: "readonly dependsOn = ['preferences']",
      },
      {
        path: 'packages/setting/src/server/preferences/preference-portability.ts',
        key: "readonly key = 'preferences'",
        schemaVersion: 'readonly schemaVersion = 3',
      },
      {
        path: 'packages/notification/src/server/application/notification-preference-portability.ts',
        key: "readonly key = 'notification-delivery-preferences'",
        schemaVersion: 'readonly schemaVersion = 3',
      },
      {
        path: 'packages/reminder/src/server/application/routine-portability.ts',
        key: "readonly key = 'routines'",
        schemaVersion: 'readonly schemaVersion = 3',
        dependsOn: 'readonly dependsOn = []',
      },
      {
        path: 'packages/schedule/src/server/application/schedule-portability.ts',
        key: "readonly key = 'schedules'",
        schemaVersion: 'readonly schemaVersion = 3',
        dependsOn: 'readonly dependsOn = []',
      },
      {
        path: 'packages/notification/src/server/application/notification-portability.ts',
        key: "readonly key = 'notifications'",
        schemaVersion: 'readonly schemaVersion = 3',
        dependsOn: 'readonly dependsOn = []',
      },
      {
        path: 'packages/label/src/application/label-portability.ts',
        key: "readonly key = 'labels'",
        schemaVersion: 'readonly schemaVersion = 3',
      },
      {
        path: 'packages/goal/src/server/application/goal-portability.ts',
        key: "readonly key = 'goals'",
        schemaVersion: 'readonly schemaVersion = 3',
        dependsOn: "readonly dependsOn = ['labels']",
      },
      {
        path: 'packages/task/src/server/application/task-portability.ts',
        key: "readonly key = 'tasks'",
        schemaVersion: 'readonly schemaVersion = 3',
        dependsOn: "readonly dependsOn = ['labels', 'goals']",
      },
      {
        path: 'packages/ai/src/server/application/ai-conversation-portability.ts',
        key: "readonly key = 'ai-conversations'",
        schemaVersion: 'readonly schemaVersion = 3',
        dependsOn: 'readonly dependsOn = []',
      },
    ];

    for (const owner of ownerContracts) {
      const source = readFileSync(resolve(repoRoot, owner.path), 'utf8');
      expect(source, owner.path).toContain(owner.key);
      expect(source, owner.path).toContain(owner.schemaVersion);
      if (owner.dependsOn) expect(source, owner.path).toContain(owner.dependsOn);
    }

  });

  it('server.ts no longer references DataPortabilityApiModule or the data-portability/api seam', () => {
    expect(server).not.toMatch(/\bDataPortabilityApiModule\b/);
    expect(server).not.toContain("from '@memoflow/data-portability/api'");
  });

  it('composer forwards owner capabilities without importing owner internals', () => {
    expect(composer).toContain('portableCapabilities?: readonly PortableCapability<unknown>[]');
    expect(composer).toContain('portableCapabilities: dependencies.portableCapabilities');
    expect(composer).not.toContain('@memoflow/setting');
    expect(composer).not.toContain('@memoflow/notification');
  });

  it('composer only touches the narrow seams (no deep server import)', () => {
    expect(composer).toContain('interface ComposeDataPortabilityDependencies');
    expect(composer).toContain("from '@memoflow/data-portability'");
    expect(composer).toContain("from '@memoflow/data-portability/api'");
    expect(composer).not.toMatch(/@memoflow\/data-portability\/server/);
  });
});
