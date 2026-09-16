import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type * as ReminderServerSeam from '../server';

/**
 * Package root owner-surface boundary.
 * 包根 owner 表面边界。
 *
 * ROUTINE-2201 cutover: the public root export surface of `@memoflow/reminder`
 * must not carry the legacy owner types. Application port and the
 * template/group/response/preference repositories are a transitional server
 * concern; hosts import them from the explicit `@memoflow/reminder/server`
 * migration seam. The canonical Routine runtime exports stay on the root.
 *
 * ROUTINE-2201 切换：`@memoflow/reminder` 的公开根导出面不得携带遗留 owner 类型。
 * 应用 Port 与 template/group/response/preference 仓储属于过渡期服务端关注点；
 * 宿主从显式的 `@memoflow/reminder/server` 迁移 seam 导入。规范 Routine 运行时
 * 导出保留在根。
 */
const LEGACY_OWNER_TYPES = [
  'ReminderApplicationPort',
  'IReminderTemplateRepository',
  'IReminderGroupRepository',
  'IReminderResponseRepository',
  'IUserReminderPreferenceRepository',
] as const;

const CANONICAL_ROOT_VALUE_EXPORTS = [
  'createReminderModule',
  'createReminderPrismaModule',
  'createReminderPrismaRepositories',
  'createReminderPowerSyncModule',
  'createReminderPowerSyncRepositories',
  'createReminderUseCases',
  'createPowerSyncClosureChecker',
  'loadPowerSyncRoutineLocalRegistrations',
  'createReminderScheduleExecutionSource',
  'createReminderScheduleProjectionSource',
] as const;

// The root barrel pulls the full server composition graph (Prisma/PowerSync
// ingredient factories), so the first module resolution is expensive. Resolve
// it once with a raised budget instead of re-importing per test.
const ROOT_IMPORT_BUDGET_MS = 60_000;

describe('@memoflow/reminder package root owner surface', () => {
  let rootExportNames: readonly string[];

  beforeAll(async () => {
    const rootModule = await import('../index');
    rootExportNames = Object.keys(rootModule);
  }, ROOT_IMPORT_BUDGET_MS);

  it('root source does not re-export legacy owner types', () => {
    const root = readFileSync(resolve(__dirname, '../index.ts'), 'utf8');
    for (const name of LEGACY_OWNER_TYPES) {
      expect(root).not.toMatch(new RegExp(`\\b${name}\\b`));
    }
  });

  it('root runtime namespace does not expose legacy owner type names', () => {
    for (const name of LEGACY_OWNER_TYPES) {
      expect(rootExportNames).not.toContain(name);
    }
  });

  it('canonical Routine runtime root exports remain intact', () => {
    for (const name of CANONICAL_ROOT_VALUE_EXPORTS) {
      expect(rootExportNames).toContain(name);
    }
  });

  it('the /server migration seam still carries the legacy owner types (compile-time lock)', () => {
    // These aliases only compile because `@memoflow/reminder/server` re-exports
    // the owner types; they are the migration seam, not the public root.
    type ApplicationPort = ReminderServerSeam.ReminderApplicationPort;
    type TemplateRepository = ReminderServerSeam.IReminderTemplateRepository;
    type GroupRepository = ReminderServerSeam.IReminderGroupRepository;
    type ResponseRepository = ReminderServerSeam.IReminderResponseRepository;
    type PreferenceRepository = ReminderServerSeam.IUserReminderPreferenceRepository;

    const lock = undefined as unknown as [
      ApplicationPort,
      TemplateRepository,
      GroupRepository,
      ResponseRepository,
      PreferenceRepository,
    ];
    expect(lock).toBeUndefined();
  });
});
