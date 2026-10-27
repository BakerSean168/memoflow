import path from 'node:path';
import type { Alias } from 'vite';

function toPosixPath(value: string): string {
  return value.replace(/\\/g, '/');
}

function resolveFromWorkspace(workspaceRoot: string, relativePath: string): string {
  return toPosixPath(path.resolve(workspaceRoot, relativePath));
}

export function createWorkspaceSourceAliasEntries(
  workspaceRoot: string,
  entries: ReadonlyArray<readonly [string, string]>,
): Alias[] {
  return entries.map(([find, relativePath]) => ({
    find,
    replacement: resolveFromWorkspace(workspaceRoot, relativePath),
  }));
}

export function createAppVueSourceAliasEntries(workspaceRoot: string): Alias[] {
  const appVueRoot = resolveFromWorkspace(workspaceRoot, 'packages/app-vue/src');

  return [
    {
      find: /^@memoflow\/app-vue\/web-overlays$/,
      replacement: `${appVueRoot}/web-overlays.ts`,
    },
    {
      find: /^@memoflow\/app-vue\/di$/,
      replacement: `${appVueRoot}/di/index.ts`,
    },
    {
      find: /^@memoflow\/app-vue\/desktop$/,
      replacement: `${appVueRoot}/desktop.ts`,
    },
    {
      find: /^@memoflow\/app-vue\/plugins\/i18n$/,
      replacement: `${appVueRoot}/plugins/i18n.ts`,
    },
    {
      find: /^@memoflow\/app-vue\/router$/,
      replacement: `${appVueRoot}/router/index.ts`,
    },
    {
      find: /^@memoflow\/app-vue\/modules\/([^/]+)$/,
      replacement: `${appVueRoot}/modules/$1/index.ts`,
    },
    {
      find: /^@memoflow\/app-vue\/modules\/(.+)$/,
      replacement: `${appVueRoot}/modules/$1`,
    },
    {
      find: /^@memoflow\/app-vue\/(.+)$/,
      replacement: `${appVueRoot}/$1`,
    },
    {
      find: /^@memoflow\/app-vue$/,
      replacement: `${appVueRoot}/index.ts`,
    },
  ];
}

export function createContractsAliasEntries(workspaceRoot: string): Alias[] {
  const contractsRoot = resolveFromWorkspace(workspaceRoot, 'packages/contracts/src');

  return [
    {
      find: /^@memoflow\/routine-contracts\/method-library$/,
      replacement: resolveFromWorkspace(
        workspaceRoot,
        'packages/routine-contracts/src/method-library/index.ts',
      ),
    },
    {
      find: /^@memoflow\/routine-contracts$/,
      replacement: resolveFromWorkspace(workspaceRoot, 'packages/routine-contracts/src/index.ts'),
    },
    {
      find: /^@memoflow\/routine-client$/,
      replacement: resolveFromWorkspace(workspaceRoot, 'packages/routine-client/src/index.ts'),
    },

    {
      find: /^@memoflow\/contracts\/primitives$/,
      replacement: `${contractsRoot}/primitives/index.ts`,
    },
    {
      find: /^@memoflow\/contracts\/primitives\/(.+)$/,
      replacement: `${contractsRoot}/primitives/$1`,
    },
    {
      find: /^@memoflow\/contracts\/shared$/,
      replacement: `${contractsRoot}/shared/index.ts`,
    },
    {
      find: /^@memoflow\/contracts\/result$/,
      replacement: `${contractsRoot}/result/index.ts`,
    },
    {
      find: /^@memoflow\/contracts\/electron$/,
      replacement: `${contractsRoot}/electron/index.ts`,
    },
    {
      find: /^@memoflow\/contracts\/cloud-auth$/,
      replacement: `${contractsRoot}/cloud-auth.ts`,
    },
    {
      find: /^@memoflow\/contracts\/mocks$/,
      replacement: `${contractsRoot}/mocks/index.ts`,
    },
    {
      find: /^@memoflow\/contracts\/modules\/(.+)$/,
      replacement: `${contractsRoot}/modules/$1/index.ts`,
    },
    {
      find: /^@memoflow\/contracts\/(.+)$/,
      replacement: `${contractsRoot}/modules/$1/index.ts`,
    },
    {
      find: /^@memoflow\/contracts$/,
      replacement: `${contractsRoot}/index.ts`,
    },
  ];
}

export function createGoalCoreAliasEntries(workspaceRoot: string): Alias[] {
  const goalCoreRoot = resolveFromWorkspace(workspaceRoot, 'packages/goal-core/src');

  return [
    {
      find: /^@memoflow\/goal-core$/,
      replacement: `${goalCoreRoot}/index.ts`,
    },
    {
      find: /^@memoflow\/goal-core\/ids$/,
      replacement: `${goalCoreRoot}/ids.ts`,
    },
    {
      find: /^@memoflow\/goal-core\/key-result-progress-calculator$/,
      replacement: `${goalCoreRoot}/key-result-progress-calculator.ts`,
    },
    {
      find: /^@memoflow\/goal-core\/goal-record-preview$/,
      replacement: `${goalCoreRoot}/goal-record-preview.ts`,
    },
  ];
}

export function createSharedPrimitivesAliasEntries(workspaceRoot: string): Alias[] {
  const sharedPrimitivesRoot = resolveFromWorkspace(
    workspaceRoot,
    'packages/shared-primitives/src',
  );

  return [
    {
      find: /^@memoflow\/shared-primitives$/,
      replacement: `${sharedPrimitivesRoot}/index.ts`,
    },
    {
      find: /^@memoflow\/shared-primitives\/(.+)$/,
      replacement: `${sharedPrimitivesRoot}/$1`,
    },
  ];
}

export function createTransportContractsAliasEntries(workspaceRoot: string): Alias[] {
  const transportContractsRoot = resolveFromWorkspace(
    workspaceRoot,
    'packages/transport-contracts/src',
  );

  return [
    {
      find: /^@memoflow\/transport-contracts$/,
      replacement: `${transportContractsRoot}/index.ts`,
    },
    {
      find: /^@memoflow\/transport-contracts\/(.+)$/,
      replacement: `${transportContractsRoot}/$1`,
    },
  ];
}

export function createLabelContractsAliasEntries(workspaceRoot: string): Alias[] {
  const labelContractsRoot = resolveFromWorkspace(workspaceRoot, 'packages/label-contracts/src');

  return [
    {
      find: /^@memoflow\/label-contracts$/,
      replacement: `${labelContractsRoot}/index.ts`,
    },
    {
      find: /^@memoflow\/label-contracts\/(.+)$/,
      replacement: `${labelContractsRoot}/$1`,
    },
  ];
}

export function createRelationContractsAliasEntries(workspaceRoot: string): Alias[] {
  const relationContractsRoot = resolveFromWorkspace(
    workspaceRoot,
    'packages/relation-contracts/src',
  );

  return [
    {
      find: /^@memoflow\/relation-contracts$/,
      replacement: `${relationContractsRoot}/index.ts`,
    },
    {
      find: /^@memoflow\/relation-contracts\/(.+)$/,
      replacement: `${relationContractsRoot}/$1`,
    },
  ];
}

export function createDataPortabilityContractsAliasEntries(workspaceRoot: string): Alias[] {
  const dataPortabilityContractsRoot = resolveFromWorkspace(
    workspaceRoot,
    'packages/data-portability-contracts/src',
  );

  return [
    {
      find: /^@memoflow\/data-portability-contracts$/,
      replacement: `${dataPortabilityContractsRoot}/index.ts`,
    },
    {
      find: /^@memoflow\/data-portability-contracts\/(.+)$/,
      replacement: `${dataPortabilityContractsRoot}/$1`,
    },
  ];
}

export function createGoalUiAliasEntries(workspaceRoot: string): Alias[] {
  return [
    {
      find: /^@memoflow\/goal-ui\/host$/,
      replacement: resolveFromWorkspace(workspaceRoot, 'packages/goal-ui/src/goal-ui-host.ts'),
    },
    {
      find: /^@memoflow\/goal-ui\/composables\/useGoal$/,
      replacement: resolveFromWorkspace(
        workspaceRoot,
        'packages/goal-ui/src/composables/useGoal.ts',
      ),
    },
    {
      find: /^@memoflow\/goal-ui$/,
      replacement: resolveFromWorkspace(workspaceRoot, 'packages/goal-ui/src/index.ts'),
    },
  ];
}

export function createGoalContractsAliasEntries(workspaceRoot: string): Alias[] {
  const goalContractsRoot = resolveFromWorkspace(workspaceRoot, 'packages/goal-contracts/src');

  return [
    {
      find: /^@memoflow\/goal-contracts$/,
      replacement: `${goalContractsRoot}/index.ts`,
    },
    {
      find: /^@memoflow\/goal-contracts\/(.+)$/,
      replacement: `${goalContractsRoot}/$1`,
    },
  ];
}

export function createWorkspaceContractsAliasEntries(workspaceRoot: string): Alias[] {
  const workspaceContractsRoot = resolveFromWorkspace(
    workspaceRoot,
    'packages/workspace-contracts/src',
  );

  return [
    {
      find: /^@memoflow\/workspace-contracts$/,
      replacement: `${workspaceContractsRoot}/index.ts`,
    },
    {
      find: /^@memoflow\/workspace-contracts\/(.+)$/,
      replacement: `${workspaceContractsRoot}/$1`,
    },
  ];
}

export function createDesktopContractsAliasEntries(workspaceRoot: string): Alias[] {
  const desktopContractsRoot = resolveFromWorkspace(
    workspaceRoot,
    'packages/desktop-contracts/src',
  );

  return [
    {
      find: /^@memoflow\/desktop-contracts$/,
      replacement: `${desktopContractsRoot}/index.ts`,
    },
    {
      find: /^@memoflow\/desktop-contracts\/(.+)$/,
      replacement: `${desktopContractsRoot}/$1`,
    },
  ];
}

export function createHostRuntimeAliasEntries(workspaceRoot: string): Alias[] {
  const hostRuntimeRoot = resolveFromWorkspace(workspaceRoot, 'packages/host-runtime/src');

  return [
    {
      find: /^@memoflow\/host-runtime$/,
      replacement: `${hostRuntimeRoot}/index.ts`,
    },
    {
      find: /^@memoflow\/host-runtime\/(.+)$/,
      replacement: `${hostRuntimeRoot}/$1`,
    },
  ];
}

export function createUiVueSourceAliasEntries(workspaceRoot: string): Alias[] {
  const uiVueRoot = resolveFromWorkspace(workspaceRoot, 'packages/ui-vue-shadcn/src');
  const uiCoreRoot = resolveFromWorkspace(workspaceRoot, 'packages/ui-core/src');

  return [
    {
      find: /^@memoflow\/routine-ui$/,
      replacement: resolveFromWorkspace(workspaceRoot, 'packages/routine-ui/src/index.ts'),
    },
    {
      find: /^@memoflow\/routine-ui\/host$/,
      replacement: resolveFromWorkspace(
        workspaceRoot,
        'packages/routine-ui/src/routine-ui-host.ts',
      ),
    },
    {
      find: /^@memoflow\/routine-ui\/components\/RoutineCapsulePreview$/,
      replacement: resolveFromWorkspace(
        workspaceRoot,
        'packages/routine-ui/src/components/RoutineCapsulePreview.vue',
      ),
    },
    {
      find: /^@memoflow\/routine-ui\/components\/RoutineUpcomingWidget$/,
      replacement: resolveFromWorkspace(
        workspaceRoot,
        'packages/routine-ui/src/components/RoutineUpcomingWidget.vue',
      ),
    },
    {
      find: /^@memoflow\/routine-ui\/views\/RoutineConfigurationView$/,
      replacement: resolveFromWorkspace(
        workspaceRoot,
        'packages/routine-ui/src/views/RoutineConfigurationView.vue',
      ),
    },
    {
      find: /^@memoflow\/routine-ui\/composables\/routineUpcomingCache$/,
      replacement: resolveFromWorkspace(
        workspaceRoot,
        'packages/routine-ui/src/composables/routineUpcomingCache.ts',
      ),
    },

    {
      find: /^@memoflow\/ui-vue-shadcn\/(.+)$/,
      replacement: `${uiVueRoot}/$1`,
    },
    {
      find: /^@memoflow\/ui-vue-shadcn$/,
      replacement: `${uiVueRoot}/index.ts`,
    },
    {
      find: /^@memoflow\/ui-core\/(.+)$/,
      replacement: `${uiCoreRoot}/$1`,
    },
    {
      find: /^@memoflow\/ui-core$/,
      replacement: `${uiCoreRoot}/index.ts`,
    },
    {
      find: /^@\/components\/ui\/(.+)$/,
      replacement: `${uiVueRoot}/components/ui/$1`,
    },
    {
      find: /^@\/lib\/(.+)$/,
      replacement: `${uiVueRoot}/lib/$1`,
    },
  ];
}

export function createAssetsAliasEntries(workspaceRoot: string): Alias[] {
  const assetsRoot = resolveFromWorkspace(workspaceRoot, 'packages/assets/src');

  return [
    {
      find: /^@memoflow\/assets\/audio$/,
      replacement: `${assetsRoot}/audio/index.ts`,
    },
    {
      find: /^@memoflow\/assets\/images$/,
      replacement: `${assetsRoot}/images/index.ts`,
    },
    {
      find: /^@memoflow\/assets$/,
      replacement: `${assetsRoot}/index.ts`,
    },
  ];
}

export function createReliableMessagingContractsAliasEntries(workspaceRoot: string): Alias[] {
  const reliableMessagingContractsRoot = resolveFromWorkspace(
    workspaceRoot,
    'packages/reliable-messaging-contracts/src',
  );

  return [
    {
      find: /^@memoflow\/reliable-messaging-contracts$/,
      replacement: `${reliableMessagingContractsRoot}/index.ts`,
    },
    {
      find: /^@memoflow\/reliable-messaging-contracts\/(.+)$/,
      replacement: `${reliableMessagingContractsRoot}/$1`,
    },
  ];
}

export function createNotificationContractsAliasEntries(workspaceRoot: string): Alias[] {
  const notificationContractsRoot = resolveFromWorkspace(
    workspaceRoot,
    'packages/notification-contracts/src',
  );

  return [
    {
      find: /^@memoflow\/notification-contracts$/,
      replacement: `${notificationContractsRoot}/index.ts`,
    },
    {
      find: /^@memoflow\/notification-contracts\/(.+)$/,
      replacement: `${notificationContractsRoot}/$1`,
    },
  ];
}

export function createNotificationClientAliasEntries(workspaceRoot: string): Alias[] {
  return [
    {
      find: /^@memoflow\/notification-client$/,
      replacement: resolveFromWorkspace(workspaceRoot, 'packages/notification-client/src/index.ts'),
    },
  ];
}

export function createNotificationUiAliasEntries(workspaceRoot: string): Alias[] {
  return [
    {
      find: /^@memoflow\/notification-ui\/host$/,
      replacement: resolveFromWorkspace(
        workspaceRoot,
        'packages/notification-ui/src/notification-ui-host.ts',
      ),
    },
    {
      find: /^@memoflow\/notification-ui$/,
      replacement: resolveFromWorkspace(workspaceRoot, 'packages/notification-ui/src/index.ts'),
    },
  ];
}

export function createOperationsContractsAliasEntries(workspaceRoot: string): Alias[] {
  const operationsContractsRoot = resolveFromWorkspace(
    workspaceRoot,
    'packages/operations-contracts/src',
  );

  return [
    {
      find: /^@memoflow\/operations-contracts$/,
      replacement: `${operationsContractsRoot}/index.ts`,
    },
    {
      find: /^@memoflow\/operations-contracts\/(.+)$/,
      replacement: `${operationsContractsRoot}/$1`,
    },
  ];
}

export function createTaskUiAliasEntries(workspaceRoot: string): Alias[] {
  const taskUiRoot = resolveFromWorkspace(workspaceRoot, 'packages/task-ui/src');

  return [
    {
      find: /^@memoflow\/task-ui\/host$/,
      replacement: `${taskUiRoot}/task-ui-host.ts`,
    },
    {
      find: /^@memoflow\/task-ui\/(.+)$/,
      replacement: `${taskUiRoot}/$1`,
    },
    {
      find: /^@memoflow\/task-ui$/,
      replacement: `${taskUiRoot}/index.ts`,
    },
  ];
}

export function createTaskContractsAliasEntries(workspaceRoot: string): Alias[] {
  const taskContractsRoot = resolveFromWorkspace(workspaceRoot, 'packages/task-contracts/src');

  return [
    {
      find: /^@memoflow\/task-contracts$/,
      replacement: `${taskContractsRoot}/index.ts`,
    },
    {
      find: /^@memoflow\/task-contracts\/(.+)$/,
      replacement: `${taskContractsRoot}/$1`,
    },
  ];
}

export function createScheduleContractsAliasEntries(workspaceRoot: string): Alias[] {
  const scheduleContractsRoot = resolveFromWorkspace(
    workspaceRoot,
    'packages/schedule-contracts/src',
  );

  return [
    {
      find: /^@memoflow\/schedule-contracts$/,
      replacement: `${scheduleContractsRoot}/index.ts`,
    },
    {
      find: /^@memoflow\/schedule-contracts\/(.+)$/,
      replacement: `${scheduleContractsRoot}/$1`,
    },
  ];
}

export function createScheduleUiAliasEntries(workspaceRoot: string): Alias[] {
  return [
    {
      find: /^@memoflow\/schedule-ui$/,
      replacement: resolveFromWorkspace(workspaceRoot, 'packages/schedule-ui/src/index.ts'),
    },
  ];
}

export function createRepositoryClientAliasEntries(workspaceRoot: string): Alias[] {
  return [
    {
      find: /^@memoflow\/repository-client$/,
      replacement: resolveFromWorkspace(workspaceRoot, 'packages/repository-client/src/index.ts'),
    },
  ];
}

export function createRepositoryContractsAliasEntries(workspaceRoot: string): Alias[] {
  const repositoryContractsRoot = resolveFromWorkspace(
    workspaceRoot,
    'packages/repository-contracts/src',
  );

  return [
    {
      find: /^@memoflow\/repository-contracts$/,
      replacement: `${repositoryContractsRoot}/index.ts`,
    },
    {
      find: /^@memoflow\/repository-contracts\/(.+)$/,
      replacement: `${repositoryContractsRoot}/$1`,
    },
  ];
}

export function createRepositoryUiAliasEntries(workspaceRoot: string): Alias[] {
  return [
    {
      find: /^@memoflow\/repository-ui\/host$/,
      replacement: resolveFromWorkspace(
        workspaceRoot,
        'packages/repository-ui/src/repository-ui-host.ts',
      ),
    },
    {
      find: /^@memoflow\/repository-ui$/,
      replacement: resolveFromWorkspace(workspaceRoot, 'packages/repository-ui/src/index.ts'),
    },
  ];
}
