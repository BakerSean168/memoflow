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
    const packagesDir = path.resolve(__dirname, 'packages');

    const domainPackages = [
      'contracts',
      'task',
      'setting',
      'goal',
      'governance',
      'reminder',
      'ai',
      'cloud-auth',
      'account',
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
    const taskSrc = path.resolve(__dirname, 'packages/task/src');

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

export const contractsDeepImportResolver = {
  name: 'contracts-deep-import-resolver',
  enforce: 'pre' as const,
  async resolveId(
    this: {
      resolve: (id: string, importer: string, opts: Record<string, unknown>) => Promise<unknown>;
    },
    source: string,
    importer: string | undefined,
    options: Record<string, unknown>,
  ) {
    const match = source.match(/^@memoflow\/contracts\/(.+)/);
    if (!match || !importer) return null;
    const subpath = match[1];
    const contractsSrc = path.resolve(__dirname, 'packages/contracts/src');

    const modulesIndex = path.resolve(contractsSrc, 'modules', subpath, 'index.ts');
    const modulesResult = await this.resolve(modulesIndex, importer, {
      ...options,
      skipSelf: true,
    });
    if (modulesResult) return modulesResult;

    const topLevelIndex = path.resolve(contractsSrc, subpath, 'index.ts');
    const topLevelResult = await this.resolve(topLevelIndex, importer, {
      ...options,
      skipSelf: true,
    });
    if (topLevelResult) return topLevelResult;

    const directFile = path.resolve(contractsSrc, `${subpath}.ts`);
    const directResult = await this.resolve(directFile, importer, {
      ...options,
      skipSelf: true,
    });
    if (directResult) return directResult;

    return null;
  },
};

const contractsSrc = path.resolve(__dirname, './packages/contracts/src');

export const domainResolveAliases = [
  {
    find: '@memoflow/database/prisma',
    replacement: path.resolve(__dirname, './packages/database/src/generated/prisma/client.js'),
  },
  {
    find: '@memoflow/powersync-schema',
    replacement: path.resolve(__dirname, './packages/powersync-schema/src/index.ts'),
  },
  {
    find: '@memoflow/database',
    replacement: path.resolve(__dirname, './packages/database/src/index.ts'),
  },
  {
    find: /^@memoflow\/domain-shared\/(.+)/,
    replacement: path.resolve(__dirname, './packages/domain-shared/src/$1/index.ts'),
  },
  {
    find: '@memoflow/domain-shared',
    replacement: path.resolve(__dirname, './packages/domain-shared/src/index.ts'),
  },
  {
    find: /^@memoflow\/utils\/(.+)/,
    replacement: path.resolve(__dirname, './packages/utils/src/$1/index.ts'),
  },
  {
    find: '@memoflow/utils',
    replacement: path.resolve(__dirname, './packages/utils/src/index.ts'),
  },
  {
    find: /^@memoflow\/patterns\/(.+)/,
    replacement: path.resolve(__dirname, './packages/patterns/src/$1/index.ts'),
  },
  {
    find: '@memoflow/patterns',
    replacement: path.resolve(__dirname, './packages/patterns/src/index.ts'),
  },
  {
    find: /^@memoflow\/test-utils\/(.+)/,
    replacement: path.resolve(__dirname, './packages/test-utils/src/$1'),
  },
  {
    find: '@memoflow/test-utils',
    replacement: path.resolve(__dirname, './packages/test-utils/src/index.ts'),
  },
  {
    find: '@memoflow/contracts/result',
    replacement: path.resolve(contractsSrc, 'result/index.ts'),
  },
  {
    find: '@memoflow/contracts/shared',
    replacement: path.resolve(contractsSrc, 'shared/index.ts'),
  },
  {
    find: '@memoflow/contracts/primitives',
    replacement: path.resolve(contractsSrc, 'primitives/index.ts'),
  },
  {
    find: '@memoflow/contracts/electron',
    replacement: path.resolve(contractsSrc, 'electron/index.ts'),
  },
  {
    find: '@memoflow/contracts/mocks',
    replacement: path.resolve(contractsSrc, 'mocks/index.ts'),
  },
  {
    find: /^@memoflow\/contracts\/modules\/(.+)/,
    replacement: path.resolve(contractsSrc, 'modules/$1/index.ts'),
  },
  {
    find: /^@memoflow\/contracts\/(.+)/,
    replacement: path.resolve(contractsSrc, 'modules/$1/index.ts'),
  },
  {
    find: '@memoflow/contracts',
    replacement: path.resolve(contractsSrc, 'index.ts'),
  },
  {
    find: /^@memoflow\/time\/(.+)/,
    replacement: path.resolve(__dirname, './packages/time/src/$1'),
  },
  {
    find: '@memoflow/time',
    replacement: path.resolve(__dirname, './packages/time/src/index.ts'),
  },
  {
    find: /^@memoflow\/schedule\/(.+)/,
    replacement: path.resolve(__dirname, './packages/schedule/src/$1'),
  },
  {
    find: '@memoflow/schedule',
    replacement: path.resolve(__dirname, './packages/schedule/src/index.ts'),
  },
  {
    find: /^@memoflow\/scheduler\/(.+)/,
    replacement: path.resolve(__dirname, './packages/scheduler/src/$1'),
  },
  {
    find: '@memoflow/scheduler',
    replacement: path.resolve(__dirname, './packages/scheduler/src/index.ts'),
  },
  {
    find: /^@memoflow\/reminder\/(.+)/,
    replacement: path.resolve(__dirname, './packages/reminder/src/$1'),
  },
  {
    find: '@memoflow/reminder',
    replacement: path.resolve(__dirname, './packages/reminder/src/index.ts'),
  },
  {
    find: /^@memoflow\/notification\/(.+)/,
    replacement: path.resolve(__dirname, './packages/notification/src/$1'),
  },
  {
    find: '@memoflow/notification',
    replacement: path.resolve(__dirname, './packages/notification/src/index.ts'),
  },
  {
    find: /^@memoflow\/account\/(.+)/,
    replacement: path.resolve(__dirname, './packages/account/src/$1'),
  },
  {
    find: '@memoflow/account',
    replacement: path.resolve(__dirname, './packages/account/src/index.ts'),
  },
  {
    find: /^@memoflow\/repository\/(.+)/,
    replacement: path.resolve(__dirname, './packages/repository/src/$1'),
  },
  {
    find: '@memoflow/repository',
    replacement: path.resolve(__dirname, './packages/repository/src/index.ts'),
  },
  {
    find: /^@memoflow\/goal\/(.+)/,
    replacement: path.resolve(__dirname, './packages/goal/src/$1/index.ts'),
  },
  {
    find: '@memoflow/goal',
    replacement: path.resolve(__dirname, './packages/goal/src/index.ts'),
  },
  {
    find: /^@memoflow\/task\/(.+)/,
    replacement: path.resolve(__dirname, './packages/task/src/$1/index.ts'),
  },
  {
    find: '@memoflow/task',
    replacement: path.resolve(__dirname, './packages/task/src/index.ts'),
  },
  {
    find: /^@memoflow\/schedule-orchestration\/(.+)/,
    replacement: path.resolve(__dirname, './packages/schedule-orchestration/src/$1'),
  },
  {
    find: '@memoflow/schedule-orchestration',
    replacement: path.resolve(__dirname, './packages/schedule-orchestration/src/index.ts'),
  },
  {
    find: /^@memoflow\/cloud-auth\/(.+)/,
    replacement: path.resolve(__dirname, './packages/cloud-auth/src/$1/index.ts'),
  },
  {
    find: '@memoflow/cloud-auth',
    replacement: path.resolve(__dirname, './packages/cloud-auth/src/index.ts'),
  },
];

export const taskResolveAliases = [
  {
    find: /^@\/(.+)/,
    replacement: path.resolve(__dirname, './packages/task/src/$1'),
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
      replacement: path.resolve(__dirname, `./packages/${packageName}/src/$1`),
    },
    ...extraAliases,
    ...domainResolveAliases,
  ];
}
