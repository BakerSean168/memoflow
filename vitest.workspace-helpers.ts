import path from 'node:path';
import {
  WORKSPACE_DEEP_IMPORT_SPECIFIER,
  createWorkspaceAliasPattern,
  createWorkspaceAliasTargets,
  getWorkspacePackage,
} from './tools/workspace-package-map.ts';

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

const domainAliasPackages = [
  'database',
  'powersync-schema',
  'utils',
  'patterns',
  'test-utils',
  'cloud-auth-contracts',
  'time',
  'schedule',
  'scheduler',
  'routine-contracts',
  'routine-client',
  'account-ui',
  'routine-ui',
  'routine',
  'notification',
  'account-contracts',
  'account',
  'repository',
  'goal',
  'goal-core',
  'shared-primitives',
  'transport-contracts',
  'reliable-messaging-contracts',
  'notification-contracts',
  'repository-contracts',
  'repository-client',
  'notification-client',
  'setting-contracts',
  'setting-client',
  'notification-ui',
  'setting-ui',
  'ui-host-contracts',
  'task-ui',
  'repository-ui',
  'operations-contracts',
  'label-contracts',
  'relation-contracts',
  'data-portability-contracts',
  'ai-contracts',
  'ai-ui',
  'ai-client',
  'goal-contracts',
  'goal-ui',
  'task-contracts',
  'schedule-contracts',
  'schedule-client',
  'schedule-ui',
  'goal-workspace-contracts',
  'task-workspace-contracts',
  'desktop-contracts',
  'host-runtime',
  'task',
  'schedule-orchestration',
  'agent-gateway',
  'cloud-auth',
] as const;

export const domainResolveAliases = domainAliasPackages.flatMap((packageName) => {
  const definition = getWorkspacePackage(packageName);

  return createWorkspaceAliasTargets([packageName], {
    // Vitest resolves goal-core subpaths through the deep import alias only.
    includeSubpaths: packageName !== 'goal-core',
    // Vitest only aliases the bare setting-contracts import; Vite also needs the deep alias.
    includeDeepImport: packageName !== 'setting-contracts',
  }).map(({ specifier, target }) => {
    const literal =
      (specifier === '' && !definition.bareAliasPattern) ||
      (specifier !== '' &&
        specifier !== WORKSPACE_DEEP_IMPORT_SPECIFIER &&
        definition.literalSubpaths);

    return {
      find: literal
        ? specifier === ''
          ? `@memoflow/${packageName}`
          : `@memoflow/${packageName}/${specifier}`
        : createWorkspaceAliasPattern(packageName, specifier),
      replacement: path.resolve(import.meta.dirname, `./packages/${packageName}/src/${target}`),
    };
  });
});

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
