/// <reference types="vitest" />
import { defineConfig, mergeConfig } from 'vitest/config';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Alias, UserConfig } from 'vite';
import { createContractsAliasEntries } from './vite.workspace-aliases';

/**
 * Shared Vitest configuration for all projects
 *
 * This provides common settings that can be merged into individual project configs.
 * Use with mergeConfig() for custom configurations.
 *
 * @example
 * ```ts
 * import { defineConfig, mergeConfig } from 'vitest/config';
 * import { createSharedConfig } from '../../vitest.shared';
 *
 * export default mergeConfig(
 *   createSharedConfig({
 *     projectRoot: __dirname,
 *     environment: 'node',
 *   }),
 *   defineConfig({
 *     test: {
 *       name: 'my-project',
 *     }
 *   })
 * );
 * ```
 */

interface SharedConfigOptions {
  /** Project root directory (e.g., './packages/task') */
  projectRoot: string;
  /** Test environment: 'node' | 'happy-dom' | 'jsdom' */
  environment?: 'node' | 'happy-dom' | 'jsdom';
  /** Explicit test include globs. Defaults to workspace test/spec pattern. */
  testInclude?: string[];
  /** Extra test exclude globs appended to shared defaults. */
  testExclude?: string[];
  /** Stable suffix for CI JSON/JUnit report names. */
  reportName?: string;
  /** Additional path aliases */
  aliases?: Record<string, string>;
  /** Additional alias entries that must precede the generic @/@/ aliases */
  aliasEntries?: Alias[];
}

interface PackageVitestConfigOptions extends SharedConfigOptions {
  name: string;
  testTimeout?: number;
  pool?: 'forks' | 'threads' | 'vmForks' | 'vmThreads';
  setupFiles?: string[];
  governedCoverage?: boolean | { extraRoots?: string[] };
  sliceCoverage?: {
    roots: string[];
    thresholds: {
      statements: number;
      lines: number;
      functions: number;
      branches: number;
    };
    reportsDirectory: string;
    fileIncludePattern?: RegExp;
  };
}

export const GOVERNED_DOMAIN_COVERAGE_THRESHOLDS = {
  statements: 80,
  lines: 80,
  functions: 80,
  branches: 70,
} as const;

export function createVitestReportConfig(projectRoot: string, reportName?: string) {
  if (!process.env.CI || !process.env.TEST_REPORT_NAME || process.env.TEST_INVENTORY_LIST === '1')
    return {};
  const workspaceRoot = path.resolve(projectRoot, '../..');
  const projectId = path.relative(workspaceRoot, projectRoot).split(path.sep).join('-');
  const suffix = reportName ?? path.basename(projectRoot);
  const prefix = `${process.env.TEST_REPORT_NAME}-${projectId}-${suffix}`.replace(
    /[^a-zA-Z0-9_.-]+/g,
    '-',
  );
  const outputRoot = path.resolve(workspaceRoot, 'reports/test-system-v2/vitest');
  return {
    reporters: ['default', 'json', 'junit'],
    outputFile: {
      json: path.resolve(outputRoot, `${prefix}.json`),
      junit: path.resolve(outputRoot, `${prefix}.junit.xml`),
    },
  };
}

const DEFAULT_GOVERNED_COVERAGE_ROOTS = [
  'src/server/domain/aggregates',
  'src/server/domain/entities',
  'src/server/domain/services',
  'src/server/domain/value-objects',
] as const;

const SOURCE_FILE_PATTERN = /\.[cm]?[jt]sx?$/;
const RUNTIME_IMPLEMENTATION_PATTERN =
  /\b(class|function|const|let|var|enum|if|switch|throw|return|new)\b|=>/;

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function isIgnorableGovernedFile(fileName: string) {
  return (
    fileName === 'index.ts' ||
    fileName.endsWith('.d.ts') ||
    /\.(test|spec)\.[cm]?[jt]sx?$/.test(fileName) ||
    fileName.endsWith('.config.ts')
  );
}

function isRuntimeImplementationSource(source: string) {
  const normalized = stripComments(source).trim();
  if (!normalized) {
    return false;
  }

  return RUNTIME_IMPLEMENTATION_PATTERN.test(normalized);
}

function collectGovernedCoverageFiles(projectRoot: string, roots: readonly string[]) {
  const includedFiles = new Set<string>();

  for (const root of roots) {
    const absoluteRoot = path.resolve(projectRoot, root);
    if (!pathExists(absoluteRoot)) {
      continue;
    }

    walkGovernedCoverageRoot(projectRoot, absoluteRoot, includedFiles);
  }

  return [...includedFiles].sort();
}

function walkGovernedCoverageRoot(
  projectRoot: string,
  currentPath: string,
  includedFiles: Set<string>,
) {
  for (const entry of readdirSync(currentPath, { withFileTypes: true })) {
    const absolutePath = path.join(currentPath, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === '__tests__') {
        continue;
      }
      walkGovernedCoverageRoot(projectRoot, absolutePath, includedFiles);
      continue;
    }

    if (!SOURCE_FILE_PATTERN.test(entry.name) || isIgnorableGovernedFile(entry.name)) {
      continue;
    }

    const source = readFileSync(absolutePath, 'utf8');
    if (!isRuntimeImplementationSource(source)) {
      continue;
    }

    includedFiles.add(path.relative(projectRoot, absolutePath).split(path.sep).join('/'));
  }
}

function pathExists(targetPath: string) {
  return existsSync(targetPath);
}

export function createGovernedCoverage(
  projectRoot: string,
  options: { extraRoots?: string[] } = {},
) {
  const workspaceRoot = path.resolve(projectRoot, '../..');
  const relativeProjectRoot = path.relative(workspaceRoot, projectRoot).split(path.sep).join('/');
  const include = collectGovernedCoverageFiles(projectRoot, [
    ...DEFAULT_GOVERNED_COVERAGE_ROOTS,
    ...(options.extraRoots ?? []),
  ]);

  return {
    all: true,
    include,
    exclude: ['**/index.ts', '**/*.d.ts', '**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reportsDirectory: path.resolve(workspaceRoot, 'coverage', relativeProjectRoot),
    reporter: ['text', 'json', 'html', 'lcov'],
    thresholds: GOVERNED_DOMAIN_COVERAGE_THRESHOLDS,
  };
}

/**
 * Generic coverage config generator for any slice/layer
 * @example
 * ```ts
 * createSliceCoverage({
 *   projectRoot: __dirname,
 *   roots: ['src/server/application/use-cases'],
 *   thresholds: { statements: 70, lines: 70, functions: 70, branches: 60 },
 *   reportsDirectory: 'coverage/use-cases',
 * })
 * ```
 */
export function createSliceCoverage(options: {
  projectRoot: string;
  roots: string[];
  thresholds: {
    statements: number;
    lines: number;
    functions: number;
    branches: number;
  };
  reportsDirectory: string;
  fileIncludePattern?: RegExp;
}) {
  const { projectRoot, roots, thresholds, reportsDirectory, fileIncludePattern } = options;
  const workspaceRoot = path.resolve(projectRoot, '../..');
  const include = collectGovernedCoverageFiles(projectRoot, roots).filter((relativePath) =>
    fileIncludePattern ? fileIncludePattern.test(relativePath) : true,
  );

  return {
    all: true,
    include,
    exclude: ['**/index.ts', '**/*.d.ts', '**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reportsDirectory: path.resolve(workspaceRoot, reportsDirectory),
    reporter: ['text', 'json', 'html', 'lcov'],
    thresholds,
  };
}

/**
 * Create a shared configuration for a project
 */
export function createSharedConfig(options: SharedConfigOptions) {
  const {
    projectRoot,
    environment = 'node',
    testInclude,
    testExclude = [],
    reportName,
    aliases = {},
    aliasEntries = [],
  } = options;
  const projectSrc = path.resolve(projectRoot, './src');
  const workspaceRoot = path.resolve(projectRoot, '../..');
  const commonWorkspacePackages = [
    'account',
    'ai',
    'app-vue',
    'assets',
    'authentication',
    'cloud-auth',
    'dashboard',
    'data-portability',
    'editor',
    'goal',
    'governance',
    'http-client',
    'label',
    'notification',
    'patterns',
    'powersync-schema',
    'reminder',
    'repository',
    'schedule',
    'scheduler',
    'schedule-orchestration',
    'setting',
    'task',
    'time',
  ] as const;

  const resolvedAliases: Record<string, string> = Object.fromEntries(
    Object.entries(aliases).map(([key, value]) => [
      key,
      value.startsWith('.') ? path.resolve(projectRoot, value) : value,
    ]),
  );

  const resolvedAliasEntries: Alias[] = aliasEntries.map((entry) => ({
    ...entry,
    replacement:
      typeof entry.replacement === 'string' && entry.replacement.startsWith('.')
        ? path.resolve(projectRoot, entry.replacement)
        : entry.replacement,
  }));

  const commonWorkspaceAliasEntries: Alias[] = [
    {
      find: /^@memoflow\/database\/prisma$/,
      replacement: path.resolve(workspaceRoot, 'packages/database/src/generated/prisma/client.js'),
    },
    {
      find: /^@memoflow\/database\/powersync$/,
      replacement: path.resolve(workspaceRoot, 'packages/database/src/powersync-schema.ts'),
    },
    {
      find: /^@memoflow\/database\/dashboard-schema$/,
      replacement: path.resolve(workspaceRoot, 'packages/database/src/dashboard-schema.ts'),
    },
    {
      find: /^@memoflow\/domain-shared\/(.+)$/,
      replacement: path.resolve(workspaceRoot, 'packages/domain-shared/src/$1'),
    },
    {
      find: /^@memoflow\/utils\/(.+)$/,
      replacement: path.resolve(workspaceRoot, 'packages/utils/src/$1'),
    },
    {
      find: /^@memoflow\/test-utils\/(.+)$/,
      replacement: path.resolve(workspaceRoot, 'packages/test-utils/src/$1'),
    },
    ...commonWorkspacePackages.map(
      (packageName) =>
        ({
          find: new RegExp(`^@memoflow\\/${packageName}\\/(.+)$`),
          replacement: path.resolve(workspaceRoot, `packages/${packageName}/src/$1`),
        }) satisfies Alias,
    ),
  ];

  const commonBareAliases: Record<string, string> = Object.fromEntries([
    ['@memoflow/database', path.resolve(workspaceRoot, 'packages/database/src/index.ts')],
    ['@memoflow/domain-shared', path.resolve(workspaceRoot, 'packages/domain-shared/src/index.ts')],
    ['@memoflow/utils', path.resolve(workspaceRoot, 'packages/utils/src/index.ts')],
    ['@memoflow/test-utils', path.resolve(workspaceRoot, 'packages/test-utils/src/index.ts')],
    ...commonWorkspacePackages.map((packageName) => [
      `@memoflow/${packageName}`,
      path.resolve(workspaceRoot, `packages/${packageName}/src/index.ts`),
    ]),
  ]);

  // Common aliases for all projects
  const baseAliases: Record<string, string> = {
    ...commonBareAliases,
    ...resolvedAliases,
    '@': projectSrc,
    '@/': `${projectSrc}/`,
  };

  const baseAliasEntries: Alias[] = Object.entries(baseAliases)
    .sort(([a], [b]) => b.length - a.length)
    .map(([find, replacement]) => ({ find, replacement }));

  const finalAliasEntries: Alias[] = [
    ...resolvedAliasEntries,
    ...commonWorkspaceAliasEntries,
    ...createContractsAliasEntries(workspaceRoot),
    ...baseAliasEntries,
  ];

  return defineConfig({
    resolve: {
      alias: finalAliasEntries,
    },
    test: {
      globals: true,
      environment,
      ...createVitestReportConfig(projectRoot, reportName),
      passWithNoTests: false,
      include: testInclude ?? ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
      exclude: [
        'node_modules',
        'dist',
        'dist-electron',
        '.git',
        '.cache',
        '.nx',
        'src/test/setup.ts',
        'src/**/*.integration.{test,spec}.*',
        ...testExclude,
      ],
      coverage: {
        enabled: false, // Controlled by workspace config
        provider: 'v8',
        reporter: ['text', 'json', 'html', 'lcov'],
        exclude: ['node_modules/', 'src/test/', '**/*.d.ts', '**/*.config.*', 'dist/'],
      },
    },
  }) as UserConfig;
}

export function createPackageVitestConfig(options: PackageVitestConfigOptions) {
  const {
    name,
    projectRoot,
    testTimeout = 10000,
    pool = 'forks',
    setupFiles,
    governedCoverage = false,
    sliceCoverage,
    ...sharedOptions
  } = options;

  return mergeConfig(
    createSharedConfig({
      projectRoot,
      reportName: name,
      ...sharedOptions,
    }),
    defineConfig({
      test: {
        name,
        root: projectRoot,
        testTimeout,
        pool,
        ...(setupFiles?.length ? { setupFiles } : {}),
        ...(governedCoverage
          ? {
              coverage: createGovernedCoverage(
                projectRoot,
                governedCoverage === true ? {} : governedCoverage,
              ),
            }
          : sliceCoverage
            ? {
                coverage: createSliceCoverage({
                  projectRoot,
                  ...sliceCoverage,
                }),
              }
            : {}),
      },
    }) as UserConfig,
  );
}

/**
 * Default shared configuration
 */
export default defineConfig({
  test: {
    globals: true,
    passWithNoTests: false,
  },
});
