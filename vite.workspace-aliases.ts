import path from 'node:path';
import type { Alias } from 'vite';
import {
  createWorkspaceAliasPattern,
  createWorkspaceAliasTargets,
  type WorkspaceAliasTargetOptions,
} from './tools/workspace-package-map.ts';

function toPosixPath(value: string): string {
  return value.replace(/\\/g, '/');
}

function resolveFromWorkspace(workspaceRoot: string, relativePath: string): string {
  return toPosixPath(path.resolve(workspaceRoot, relativePath));
}

function createPackageAliasEntries(
  workspaceRoot: string,
  packageNames: readonly string[],
  options: WorkspaceAliasTargetOptions = {},
): Alias[] {
  return createWorkspaceAliasTargets(packageNames, options).map(
    ({ packageName, specifier, target }) => ({
      find: createWorkspaceAliasPattern(packageName, specifier),
      replacement: resolveFromWorkspace(workspaceRoot, `packages/${packageName}/src/${target}`),
    }),
  );
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
  return createPackageAliasEntries(workspaceRoot, ['app-vue']);
}

export function createContractsAliasEntries(workspaceRoot: string): Alias[] {
  return [
    ...createAiContractsAliasEntries(workspaceRoot),
    ...createAiClientAliasEntries(workspaceRoot),
    ...createAiUiAliasEntries(workspaceRoot),
    ...createPackageAliasEntries(workspaceRoot, [
      'cloud-auth-contracts',
      'agent-gateway',
      'routine-contracts',
      'routine-client',
    ]),
  ];
}

export function createGoalCoreAliasEntries(workspaceRoot: string): Alias[] {
  return createPackageAliasEntries(workspaceRoot, ['goal-core'], { includeDeepImport: false });
}

export function createSharedPrimitivesAliasEntries(workspaceRoot: string): Alias[] {
  return createPackageAliasEntries(workspaceRoot, ['shared-primitives']);
}

export function createTransportContractsAliasEntries(workspaceRoot: string): Alias[] {
  return createPackageAliasEntries(workspaceRoot, ['transport-contracts']);
}

export function createLabelContractsAliasEntries(workspaceRoot: string): Alias[] {
  return createPackageAliasEntries(workspaceRoot, ['label-contracts']);
}

export function createRelationContractsAliasEntries(workspaceRoot: string): Alias[] {
  return createPackageAliasEntries(workspaceRoot, ['relation-contracts']);
}

export function createDataPortabilityContractsAliasEntries(workspaceRoot: string): Alias[] {
  return createPackageAliasEntries(workspaceRoot, ['data-portability-contracts']);
}

export function createGoalUiAliasEntries(workspaceRoot: string): Alias[] {
  return createPackageAliasEntries(workspaceRoot, ['goal-ui']);
}

export function createGoalContractsAliasEntries(workspaceRoot: string): Alias[] {
  return createPackageAliasEntries(workspaceRoot, ['goal-contracts']);
}

export function createAiContractsAliasEntries(workspaceRoot: string): Alias[] {
  return createPackageAliasEntries(workspaceRoot, ['ai-contracts']);
}

export function createGoalWorkspaceContractsAliasEntries(workspaceRoot: string): Alias[] {
  return createPackageAliasEntries(workspaceRoot, ['goal-workspace-contracts']);
}

export function createTaskWorkspaceContractsAliasEntries(workspaceRoot: string): Alias[] {
  return createPackageAliasEntries(workspaceRoot, ['task-workspace-contracts']);
}

export function createDesktopContractsAliasEntries(workspaceRoot: string): Alias[] {
  return createPackageAliasEntries(workspaceRoot, ['desktop-contracts']);
}

export function createHostRuntimeAliasEntries(workspaceRoot: string): Alias[] {
  return createPackageAliasEntries(workspaceRoot, ['host-runtime']);
}

export function createUiVueSourceAliasEntries(workspaceRoot: string): Alias[] {
  const uiVueRoot = resolveFromWorkspace(workspaceRoot, 'packages/ui-vue-shadcn/src');

  return [
    ...createPackageAliasEntries(workspaceRoot, ['account-ui']),
    ...createPackageAliasEntries(workspaceRoot, ['routine-ui']),
    ...createPackageAliasEntries(workspaceRoot, ['schedule-ui'], { includeMain: false }),
    ...createPackageAliasEntries(workspaceRoot, ['ui-vue-shadcn']),
    ...createPackageAliasEntries(workspaceRoot, ['ui-core']),
    ...createPackageAliasEntries(workspaceRoot, ['ui-host-contracts']),
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
  return createPackageAliasEntries(workspaceRoot, ['assets']);
}

export function createReliableMessagingContractsAliasEntries(workspaceRoot: string): Alias[] {
  return createPackageAliasEntries(workspaceRoot, ['reliable-messaging-contracts']);
}

export function createNotificationContractsAliasEntries(workspaceRoot: string): Alias[] {
  return createPackageAliasEntries(workspaceRoot, ['notification-contracts']);
}

export function createNotificationClientAliasEntries(workspaceRoot: string): Alias[] {
  return createPackageAliasEntries(workspaceRoot, ['notification-client']);
}

export function createNotificationUiAliasEntries(workspaceRoot: string): Alias[] {
  return createPackageAliasEntries(workspaceRoot, ['notification-ui']);
}

export function createSettingContractsAliasEntries(workspaceRoot: string): Alias[] {
  return createPackageAliasEntries(workspaceRoot, ['setting-contracts']);
}

export function createSettingClientAliasEntries(workspaceRoot: string): Alias[] {
  return createPackageAliasEntries(workspaceRoot, ['setting-client']);
}

export function createSettingUiAliasEntries(workspaceRoot: string): Alias[] {
  return createPackageAliasEntries(workspaceRoot, ['setting-ui']);
}

export function createOperationsContractsAliasEntries(workspaceRoot: string): Alias[] {
  return createPackageAliasEntries(workspaceRoot, ['operations-contracts']);
}

export function createTaskUiAliasEntries(workspaceRoot: string): Alias[] {
  return createPackageAliasEntries(workspaceRoot, ['task-ui']);
}

export function createTaskContractsAliasEntries(workspaceRoot: string): Alias[] {
  return createPackageAliasEntries(workspaceRoot, ['task-contracts']);
}

export function createScheduleContractsAliasEntries(workspaceRoot: string): Alias[] {
  return createPackageAliasEntries(workspaceRoot, ['schedule-contracts']);
}

export function createScheduleUiAliasEntries(workspaceRoot: string): Alias[] {
  return createPackageAliasEntries(workspaceRoot, ['schedule-ui'], { includeSubpaths: false });
}

export function createRepositoryClientAliasEntries(workspaceRoot: string): Alias[] {
  return createPackageAliasEntries(workspaceRoot, ['repository-client']);
}

export function createRepositoryContractsAliasEntries(workspaceRoot: string): Alias[] {
  return createPackageAliasEntries(workspaceRoot, ['repository-contracts']);
}

export function createAccountContractsAliasEntries(workspaceRoot: string): Alias[] {
  return createPackageAliasEntries(workspaceRoot, ['account-contracts']);
}

export function createRepositoryUiAliasEntries(workspaceRoot: string): Alias[] {
  return createPackageAliasEntries(workspaceRoot, ['repository-ui']);
}

export function createAiClientAliasEntries(workspaceRoot: string): Alias[] {
  return createPackageAliasEntries(workspaceRoot, ['ai-client']);
}

export function createAiUiAliasEntries(workspaceRoot: string): Alias[] {
  return createPackageAliasEntries(workspaceRoot, ['ai-ui']);
}
