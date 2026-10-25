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
      find: /^@memoflow\/contracts\/primitives$/,
      replacement: `${contractsRoot}/primitives/index.ts`,
    },
    {
      find: /^@memoflow\/contracts\/primitives\/(.+)$/,
      replacement: `${contractsRoot}/primitives/$1`,
    },
    {
      find: /^@memoflow\/contracts\/reliable-messaging$/,
      replacement: `${contractsRoot}/modules/reliable-messaging/index.ts`,
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

export function createUiVueSourceAliasEntries(workspaceRoot: string): Alias[] {
  const uiVueRoot = resolveFromWorkspace(workspaceRoot, 'packages/ui-vue-shadcn/src');
  const uiCoreRoot = resolveFromWorkspace(workspaceRoot, 'packages/ui-core/src');

  return [
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
