import path from 'node:path';

export const domainResolveAtAlias = {
  name: 'domain-resolve-at-alias',
  enforce: 'pre' as const,
  async resolveId(
    this: {
      resolve: (id: string, importer: string, opts: Record<string, unknown>) => Promise<unknown>;
    },
    source: string,
    importer: string | undefined,
    options: Record<string, unknown>,
  ) {
    if (!source.startsWith('@/') || !importer) return null;
    const subpath = source.slice(2);
    const packagesDir = path.resolve(import.meta.dirname, 'packages');

    const domainPackages = [
      'task',
      'setting',
      'goal',
      'routine',
      'ai',
      'cloud-auth',
      'account',
      'account-contracts',
      'notification',
      'editor',
      'repository',
      'schedule',
      'scheduler',
      'schedule-orchestration',
    ];

    let root: string | null = null;
    for (const pkg of domainPackages) {
      if (importer.startsWith(path.resolve(packagesDir, pkg) + '/')) {
        root = path.resolve(packagesDir, pkg, 'src');
        break;
      }
    }

    if (!root) return null;

    const resolved = path.resolve(root, subpath);
    return this.resolve(resolved, importer, {
      ...options,
      skipSelf: true,
    });
  },
};

export const taskDeepImportResolver = {
  name: 'task-deep-import-resolver',
  enforce: 'pre' as const,
  async resolveId(
    this: {
      resolve: (id: string, importer: string, opts: Record<string, unknown>) => Promise<unknown>;
    },
    source: string,
    importer: string | undefined,
    options: Record<string, unknown>,
  ) {
    const match = source.match(/^@memoflow\/task\/(.+)/);
    if (!match || !importer) return null;
    const subpath = match[1];
    const taskSrc = path.resolve(import.meta.dirname, 'packages/task/src');

    const directFile = path.resolve(taskSrc, `${subpath}.ts`);
    const directResult = await this.resolve(directFile, importer, {
      ...options,
      skipSelf: true,
    });
    if (directResult) return directResult;

    const indexFile = path.resolve(taskSrc, subpath, 'index.ts');
    const indexResult = await this.resolve(indexFile, importer, {
      ...options,
      skipSelf: true,
    });
    if (indexResult) return indexResult;

    return null;
  },
};

export const domainResolveAliases = [
  {
    find: '@memoflow/database/transaction',
    replacement: path.resolve(import.meta.dirname, './packages/database/src/transaction.ts'),
  },
  {
    find: '@memoflow/database/prisma',
    replacement: path.resolve(
      import.meta.dirname,
      './packages/database/src/generated/prisma/client.js',
    ),
  },
  {
    find: '@memoflow/powersync-schema',
    replacement: path.resolve(import.meta.dirname, './packages/powersync-schema/src/index.ts'),
  },
  {
    find: '@memoflow/database',
    replacement: path.resolve(import.meta.dirname, './packages/database/src/index.ts'),
  },
  {
    find: /^@memoflow\/utils\/(.+)/,
    replacement: path.resolve(import.meta.dirname, './packages/utils/src/$1/index.ts'),
  },
  {
    find: '@memoflow/utils',
    replacement: path.resolve(import.meta.dirname, './packages/utils/src/index.ts'),
  },
  {
    find: /^@memoflow\/patterns\/(.+)/,
    replacement: path.resolve(import.meta.dirname, './packages/patterns/src/$1/index.ts'),
  },
  {
    find: '@memoflow/patterns',
    replacement: path.resolve(import.meta.dirname, './packages/patterns/src/index.ts'),
  },
  {
    find: /^@memoflow\/test-utils\/(.+)/,
    replacement: path.resolve(import.meta.dirname, './packages/test-utils/src/$1'),
  },
  {
    find: '@memoflow/test-utils',
    replacement: path.resolve(import.meta.dirname, './packages/test-utils/src/index.ts'),
  },
  {
    find: /^@memoflow\/cloud-auth-contracts$/,
    replacement: path.resolve(import.meta.dirname, './packages/cloud-auth-contracts/src/index.ts'),
  },
  {
    find: /^@memoflow\/time\/(.+)/,
    replacement: path.resolve(import.meta.dirname, './packages/time/src/$1'),
  },
  {
    find: '@memoflow/time',
    replacement: path.resolve(import.meta.dirname, './packages/time/src/index.ts'),
  },
  {
    find: /^@memoflow\/schedule\/(.+)/,
    replacement: path.resolve(import.meta.dirname, './packages/schedule/src/$1'),
  },
  {
    find: '@memoflow/schedule',
    replacement: path.resolve(import.meta.dirname, './packages/schedule/src/index.ts'),
  },
  {
    find: /^@memoflow\/scheduler\/(.+)/,
    replacement: path.resolve(import.meta.dirname, './packages/scheduler/src/$1'),
  },
  {
    find: '@memoflow/scheduler',
    replacement: path.resolve(import.meta.dirname, './packages/scheduler/src/index.ts'),
  },
  {
    find: /^@memoflow\/routine-contracts\/method-library$/,
    replacement: path.resolve(
      import.meta.dirname,
      './packages/routine-contracts/src/method-library/index.ts',
    ),
  },
  {
    find: /^@memoflow\/routine-contracts$/,
    replacement: path.resolve(import.meta.dirname, './packages/routine-contracts/src/index.ts'),
  },
  {
    find: /^@memoflow\/routine-client$/,
    replacement: path.resolve(import.meta.dirname, './packages/routine-client/src/index.ts'),
  },
  {
    find: /^@memoflow\/account-ui\/host$/,
    replacement: path.resolve(import.meta.dirname, './packages/account-ui/src/account-ui-host.ts'),
  },
  {
    find: /^@memoflow\/account-ui$/,
    replacement: path.resolve(import.meta.dirname, './packages/account-ui/src/index.ts'),
  },
  {
    find: /^@memoflow\/routine-ui\/host$/,
    replacement: path.resolve(import.meta.dirname, './packages/routine-ui/src/routine-ui-host.ts'),
  },
  {
    find: /^@memoflow\/routine-ui\/components\/RoutineCapsulePreview$/,
    replacement: path.resolve(
      import.meta.dirname,
      './packages/routine-ui/src/components/RoutineCapsulePreview.vue',
    ),
  },
  {
    find: /^@memoflow\/routine-ui\/components\/RoutineUpcomingWidget$/,
    replacement: path.resolve(
      import.meta.dirname,
      './packages/routine-ui/src/components/RoutineUpcomingWidget.vue',
    ),
  },
  {
    find: /^@memoflow\/routine-ui\/views\/RoutineConfigurationView$/,
    replacement: path.resolve(
      import.meta.dirname,
      './packages/routine-ui/src/views/RoutineConfigurationView.vue',
    ),
  },
  {
    find: /^@memoflow\/routine-ui\/composables\/routineUpcomingCache$/,
    replacement: path.resolve(
      import.meta.dirname,
      './packages/routine-ui/src/composables/routineUpcomingCache.ts',
    ),
  },
  {
    find: /^@memoflow\/routine-ui$/,
    replacement: path.resolve(import.meta.dirname, './packages/routine-ui/src/index.ts'),
  },
  {
    find: /^@memoflow\/routine\/(.+)/,
    replacement: path.resolve(import.meta.dirname, './packages/routine/src/$1'),
  },
  {
    find: /^@memoflow\/routine$/,
    replacement: path.resolve(import.meta.dirname, './packages/routine/src/index.ts'),
  },
  {
    find: /^@memoflow\/notification\/(.+)/,
    replacement: path.resolve(import.meta.dirname, './packages/notification/src/$1'),
  },
  {
    find: '@memoflow/notification',
    replacement: path.resolve(import.meta.dirname, './packages/notification/src/index.ts'),
  },
  {
    find: /^@memoflow\/account-contracts\/(.+)/,
    replacement: path.resolve(import.meta.dirname, './packages/account-contracts/src/$1'),
  },
  {
    find: '@memoflow/account-contracts',
    replacement: path.resolve(import.meta.dirname, './packages/account-contracts/src/index.ts'),
  },
  {
    find: /^@memoflow\/account\/(.+)/,
    replacement: path.resolve(import.meta.dirname, './packages/account/src/$1'),
  },
  {
    find: '@memoflow/account',
    replacement: path.resolve(import.meta.dirname, './packages/account/src/index.ts'),
  },
  {
    find: /^@memoflow\/repository\/(.+)/,
    replacement: path.resolve(import.meta.dirname, './packages/repository/src/$1'),
  },
  {
    find: '@memoflow/repository',
    replacement: path.resolve(import.meta.dirname, './packages/repository/src/index.ts'),
  },
  {
    find: /^@memoflow\/goal\/(.+)/,
    replacement: path.resolve(import.meta.dirname, './packages/goal/src/$1/index.ts'),
  },
  {
    find: '@memoflow/goal',
    replacement: path.resolve(import.meta.dirname, './packages/goal/src/index.ts'),
  },
  {
    find: /^@memoflow\/goal-core\/(.+)/,
    replacement: path.resolve(import.meta.dirname, './packages/goal-core/src/$1'),
  },
  {
    find: '@memoflow/goal-core',
    replacement: path.resolve(import.meta.dirname, './packages/goal-core/src/index.ts'),
  },
  {
    find: /^@memoflow\/shared-primitives\/(.+)/,
    replacement: path.resolve(import.meta.dirname, './packages/shared-primitives/src/$1'),
  },
  {
    find: '@memoflow/shared-primitives',
    replacement: path.resolve(import.meta.dirname, './packages/shared-primitives/src/index.ts'),
  },
  {
    find: /^@memoflow\/transport-contracts\/(.+)/,
    replacement: path.resolve(import.meta.dirname, './packages/transport-contracts/src/$1'),
  },
  {
    find: '@memoflow/transport-contracts',
    replacement: path.resolve(import.meta.dirname, './packages/transport-contracts/src/index.ts'),
  },
  {
    find: /^@memoflow\/reliable-messaging-contracts\/(.+)/,
    replacement: path.resolve(
      import.meta.dirname,
      './packages/reliable-messaging-contracts/src/$1',
    ),
  },
  {
    find: '@memoflow/reliable-messaging-contracts',
    replacement: path.resolve(
      import.meta.dirname,
      './packages/reliable-messaging-contracts/src/index.ts',
    ),
  },
  {
    find: /^@memoflow\/notification-contracts\/(.+)/,
    replacement: path.resolve(import.meta.dirname, './packages/notification-contracts/src/$1'),
  },
  {
    find: '@memoflow/notification-contracts',
    replacement: path.resolve(
      import.meta.dirname,
      './packages/notification-contracts/src/index.ts',
    ),
  },
  {
    find: /^@memoflow\/repository-contracts$/,
    replacement: path.resolve(import.meta.dirname, './packages/repository-contracts/src/index.ts'),
  },
  {
    find: /^@memoflow\/repository-contracts\/(.+)/,
    replacement: path.resolve(import.meta.dirname, './packages/repository-contracts/src/$1'),
  },
  {
    find: /^@memoflow\/repository-client$/,
    replacement: path.resolve(import.meta.dirname, './packages/repository-client/src/index.ts'),
  },
  {
    find: /^@memoflow\/notification-client$/,
    replacement: path.resolve(import.meta.dirname, './packages/notification-client/src/index.ts'),
  },
  {
    find: /^@memoflow\/setting-contracts$/,
    replacement: path.resolve(import.meta.dirname, './packages/setting-contracts/src/index.ts'),
  },
  {
    find: /^@memoflow\/setting-client$/,
    replacement: path.resolve(import.meta.dirname, './packages/setting-client/src/index.ts'),
  },
  {
    find: /^@memoflow\/notification-ui\/host$/,
    replacement: path.resolve(
      import.meta.dirname,
      './packages/notification-ui/src/notification-ui-host.ts',
    ),
  },
  {
    find: /^@memoflow\/setting-ui\/host$/,
    replacement: path.resolve(import.meta.dirname, './packages/setting-ui/src/setting-ui-host.ts'),
  },
  {
    find: /^@memoflow\/setting-ui$/,
    replacement: path.resolve(import.meta.dirname, './packages/setting-ui/src/index.ts'),
  },
  {
    find: /^@memoflow\/notification-ui$/,
    replacement: path.resolve(import.meta.dirname, './packages/notification-ui/src/index.ts'),
  },
  {
    find: /^@memoflow\/task-ui\/host$/,
    replacement: path.resolve(import.meta.dirname, './packages/task-ui/src/task-ui-host.ts'),
  },
  {
    find: /^@memoflow\/task-ui\/(.+)$/,
    replacement: path.resolve(import.meta.dirname, './packages/task-ui/src/$1'),
  },
  {
    find: /^@memoflow\/task-ui$/,
    replacement: path.resolve(import.meta.dirname, './packages/task-ui/src/index.ts'),
  },
  {
    find: /^@memoflow\/repository-ui\/host$/,
    replacement: path.resolve(
      import.meta.dirname,
      './packages/repository-ui/src/repository-ui-host.ts',
    ),
  },
  {
    find: /^@memoflow\/repository-ui\/(.+)$/,
    replacement: path.resolve(import.meta.dirname, './packages/repository-ui/src/$1'),
  },
  {
    find: /^@memoflow\/repository-ui$/,
    replacement: path.resolve(import.meta.dirname, './packages/repository-ui/src/index.ts'),
  },
  {
    find: /^@memoflow\/operations-contracts\/(.+)/,
    replacement: path.resolve(import.meta.dirname, './packages/operations-contracts/src/$1'),
  },
  {
    find: '@memoflow/operations-contracts',
    replacement: path.resolve(import.meta.dirname, './packages/operations-contracts/src/index.ts'),
  },
  {
    find: /^@memoflow\/label-contracts\/(.+)/,
    replacement: path.resolve(import.meta.dirname, './packages/label-contracts/src/$1'),
  },
  {
    find: '@memoflow/label-contracts',
    replacement: path.resolve(import.meta.dirname, './packages/label-contracts/src/index.ts'),
  },
  {
    find: /^@memoflow\/relation-contracts\/(.+)/,
    replacement: path.resolve(import.meta.dirname, './packages/relation-contracts/src/$1'),
  },
  {
    find: '@memoflow/relation-contracts',
    replacement: path.resolve(import.meta.dirname, './packages/relation-contracts/src/index.ts'),
  },
  {
    find: /^@memoflow\/data-portability-contracts\/(.+)/,
    replacement: path.resolve(import.meta.dirname, './packages/data-portability-contracts/src/$1'),
  },
  {
    find: '@memoflow/data-portability-contracts',
    replacement: path.resolve(
      import.meta.dirname,
      './packages/data-portability-contracts/src/index.ts',
    ),
  },
  {
    find: /^@memoflow\/ai-contracts\/(.+)/,
    replacement: path.resolve(import.meta.dirname, './packages/ai-contracts/src/$1'),
  },
  {
    find: /^@memoflow\/ai-contracts$/,
    replacement: path.resolve(import.meta.dirname, './packages/ai-contracts/src/index.ts'),
  },
  {
    find: /^@memoflow\/ai-ui\/host$/,
    replacement: path.resolve(import.meta.dirname, './packages/ai-ui/src/ai-ui-host.ts'),
  },
  {
    find: /^@memoflow\/ai-client\/(.+)$/,
    replacement: path.resolve(import.meta.dirname, './packages/ai-client/src/$1'),
  },
  {
    find: /^@memoflow\/ai-client$/,
    replacement: path.resolve(import.meta.dirname, './packages/ai-client/src/index.ts'),
  },
  {
    find: /^@memoflow\/ai-ui\/(.+)$/,
    replacement: path.resolve(import.meta.dirname, './packages/ai-ui/src/$1'),
  },
  {
    find: /^@memoflow\/ai-ui$/,
    replacement: path.resolve(import.meta.dirname, './packages/ai-ui/src/index.ts'),
  },
  {
    find: /^@memoflow\/goal-contracts\/(.+)/,
    replacement: path.resolve(import.meta.dirname, './packages/goal-contracts/src/$1'),
  },
  {
    find: /^@memoflow\/goal-ui\/host$/,
    replacement: path.resolve(import.meta.dirname, './packages/goal-ui/src/goal-ui-host.ts'),
  },
  {
    find: /^@memoflow\/goal-ui\/composables\/useGoal$/,
    replacement: path.resolve(import.meta.dirname, './packages/goal-ui/src/composables/useGoal.ts'),
  },
  {
    find: /^@memoflow\/goal-ui\/(.+)$/,
    replacement: path.resolve(import.meta.dirname, './packages/goal-ui/src/$1'),
  },
  {
    find: /^@memoflow\/goal-ui$/,
    replacement: path.resolve(import.meta.dirname, './packages/goal-ui/src/index.ts'),
  },
  {
    find: '@memoflow/goal-contracts',
    replacement: path.resolve(import.meta.dirname, './packages/goal-contracts/src/index.ts'),
  },
  {
    find: /^@memoflow\/task-contracts\/(.+)/,
    replacement: path.resolve(import.meta.dirname, './packages/task-contracts/src/$1'),
  },
  {
    find: '@memoflow/task-contracts',
    replacement: path.resolve(import.meta.dirname, './packages/task-contracts/src/index.ts'),
  },
  {
    find: /^@memoflow\/schedule-contracts\/(.+)/,
    replacement: path.resolve(import.meta.dirname, './packages/schedule-contracts/src/$1'),
  },
  {
    find: '@memoflow/schedule-contracts',
    replacement: path.resolve(import.meta.dirname, './packages/schedule-contracts/src/index.ts'),
  },
  {
    find: '@memoflow/schedule-client',
    replacement: path.resolve(import.meta.dirname, './packages/schedule-client/src/index.ts'),
  },
  {
    find: '@memoflow/schedule-ui',
    replacement: path.resolve(import.meta.dirname, './packages/schedule-ui/src/index.ts'),
  },
  {
    find: /^@memoflow\/goal-workspace-contracts\/(.+)/,
    replacement: path.resolve(import.meta.dirname, './packages/goal-workspace-contracts/src/$1'),
  },
  {
    find: /^@memoflow\/task-workspace-contracts\/(.+)/,
    replacement: path.resolve(import.meta.dirname, './packages/task-workspace-contracts/src/$1'),
  },
  {
    find: '@memoflow/goal-workspace-contracts',
    replacement: path.resolve(
      import.meta.dirname,
      './packages/goal-workspace-contracts/src/index.ts',
    ),
  },
  {
    find: '@memoflow/task-workspace-contracts',
    replacement: path.resolve(
      import.meta.dirname,
      './packages/task-workspace-contracts/src/index.ts',
    ),
  },
  {
    find: /^@memoflow\/desktop-contracts\/(.+)/,
    replacement: path.resolve(import.meta.dirname, './packages/desktop-contracts/src/$1'),
  },
  {
    find: '@memoflow/desktop-contracts',
    replacement: path.resolve(import.meta.dirname, './packages/desktop-contracts/src/index.ts'),
  },
  {
    find: /^@memoflow\/host-runtime\/(.+)/,
    replacement: path.resolve(import.meta.dirname, './packages/host-runtime/src/$1'),
  },
  {
    find: '@memoflow/host-runtime',
    replacement: path.resolve(import.meta.dirname, './packages/host-runtime/src/index.ts'),
  },
  {
    find: /^@memoflow\/task\/(.+)/,
    replacement: path.resolve(import.meta.dirname, './packages/task/src/$1/index.ts'),
  },
  {
    find: '@memoflow/task',
    replacement: path.resolve(import.meta.dirname, './packages/task/src/index.ts'),
  },
  {
    find: /^@memoflow\/schedule-orchestration\/(.+)/,
    replacement: path.resolve(import.meta.dirname, './packages/schedule-orchestration/src/$1'),
  },
  {
    find: '@memoflow/schedule-orchestration',
    replacement: path.resolve(
      import.meta.dirname,
      './packages/schedule-orchestration/src/index.ts',
    ),
  },
  {
    find: /^@memoflow\/cloud-auth-contracts\/(.+)$/,
    replacement: path.resolve(import.meta.dirname, './packages/cloud-auth-contracts/src/$1'),
  },
  {
    find: /^@memoflow\/agent-gateway$/,
    replacement: path.resolve(import.meta.dirname, './packages/agent-gateway/src/index.ts'),
  },
  {
    find: /^@memoflow\/agent-gateway\/server$/,
    replacement: path.resolve(import.meta.dirname, './packages/agent-gateway/src/server/index.ts'),
  },
  {
    find: /^@memoflow\/cloud-auth\/(.+)/,
    replacement: path.resolve(import.meta.dirname, './packages/cloud-auth/src/$1/index.ts'),
  },
  {
    find: '@memoflow/cloud-auth',
    replacement: path.resolve(import.meta.dirname, './packages/cloud-auth/src/index.ts'),
  },
];

export const taskResolveAliases = [
  {
    find: /^@\/(.+)/,
    replacement: path.resolve(import.meta.dirname, './packages/task/src/$1'),
  },
  ...domainResolveAliases,
];

export function createPackageResolveAliases(
  packageName: string,
  extraAliases: Array<{ find: string | RegExp; replacement: string }> = [],
) {
  return [
    {
      find: /^@\/(.+)/,
      replacement: path.resolve(import.meta.dirname, `./packages/${packageName}/src/$1`),
    },
    ...extraAliases,
    ...domainResolveAliases,
  ];
}
