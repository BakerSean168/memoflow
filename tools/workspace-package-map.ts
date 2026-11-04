/**
 * Single source of truth for workspace package alias targets.
 *
 * `vite.workspace-aliases.ts` (Vite serve/build) and
 * `vitest.workspace-helpers.ts` (Vitest resolution) both enumerate the same
 * `@memoflow/*` packages. Package names, source directories and subpath targets
 * live here; each consumer only decides how to render them.
 */

export interface WorkspacePackageSubpath {
  /** Import subpath after the package name, e.g. `host` or `components/Foo`. */
  readonly subpath: string;
  /** Target path relative to `packages/<name>/src`. */
  readonly target: string;
}

export interface WorkspacePackageDefinition {
  readonly name: string;
  /** Target of the bare `@memoflow/<name>` import, relative to `packages/<name>/src`. */
  readonly main: string;
  /** Exact subpath aliases, always rendered before the deep-import alias. */
  readonly subpaths?: readonly WorkspacePackageSubpath[];
  /** Deep import target template relative to `packages/<name>/src`; `$1` is the captured subpath. */
  readonly deepImport?: string;
  /** Render the bare alias as an anchored RegExp instead of a literal string (Vitest only). */
  readonly bareAliasPattern?: boolean;
  /** Render exact subpath aliases as literal strings instead of anchored RegExp (Vitest only). */
  readonly literalSubpaths?: boolean;
}

export const WORKSPACE_DEEP_IMPORT_SPECIFIER = '(.+)';

const WORKSPACE_PACKAGE_DEFINITIONS: readonly WorkspacePackageDefinition[] = [
  { name: 'account', main: 'index.ts', deepImport: '$1' },
  { name: 'account-contracts', main: 'index.ts', deepImport: '$1' },
  {
    name: 'account-ui',
    main: 'index.ts',
    subpaths: [{ subpath: 'host', target: 'account-ui-host.ts' }],
    bareAliasPattern: true,
  },
  {
    name: 'agent-gateway',
    main: 'index.ts',
    subpaths: [{ subpath: 'server', target: 'server/index.ts' }],
    bareAliasPattern: true,
  },
  { name: 'ai-client', main: 'index.ts', deepImport: '$1' },
  { name: 'ai-contracts', main: 'index.ts', deepImport: '$1' },
  {
    name: 'ai-ui',
    main: 'index.ts',
    subpaths: [{ subpath: 'host', target: 'ai-ui-host.ts' }],
    deepImport: '$1',
  },
  {
    name: 'app-vue',
    main: 'index.ts',
    subpaths: [
      { subpath: 'web-overlays', target: 'web-overlays.ts' },
      { subpath: 'di', target: 'di/index.ts' },
      { subpath: 'desktop', target: 'desktop.ts' },
      { subpath: 'plugins/i18n', target: 'plugins/i18n.ts' },
      { subpath: 'router', target: 'router/index.ts' },
    ],
    deepImport: '$1',
  },
  {
    name: 'assets',
    main: 'index.ts',
    subpaths: [
      { subpath: 'audio', target: 'audio/index.ts' },
      { subpath: 'images', target: 'images/index.ts' },
    ],
  },
  { name: 'cloud-auth', main: 'index.ts', deepImport: '$1/index.ts' },
  { name: 'cloud-auth-contracts', main: 'index.ts', deepImport: '$1' },
  { name: 'data-portability-contracts', main: 'index.ts', deepImport: '$1' },
  {
    name: 'database',
    main: 'index.ts',
    subpaths: [
      { subpath: 'transaction', target: 'transaction.ts' },
      { subpath: 'prisma', target: 'generated/prisma/client.js' },
    ],
    literalSubpaths: true,
  },
  { name: 'desktop-contracts', main: 'index.ts', deepImport: '$1' },
  { name: 'goal', main: 'index.ts', deepImport: '$1/index.ts' },
  { name: 'goal-contracts', main: 'index.ts', deepImport: '$1' },
  {
    name: 'goal-core',
    main: 'index.ts',
    subpaths: [
      { subpath: 'ids', target: 'ids.ts' },
      { subpath: 'key-result-progress-calculator', target: 'key-result-progress-calculator.ts' },
      { subpath: 'goal-record-preview', target: 'goal-record-preview.ts' },
    ],
    deepImport: '$1',
  },
  {
    name: 'goal-ui',
    main: 'index.ts',
    subpaths: [
      { subpath: 'host', target: 'goal-ui-host.ts' },
      { subpath: 'composables/useGoal', target: 'composables/useGoal.ts' },
    ],
    deepImport: '$1',
  },
  { name: 'goal-workspace-contracts', main: 'index.ts', deepImport: '$1' },
  { name: 'host-runtime', main: 'index.ts', deepImport: '$1' },
  { name: 'label-contracts', main: 'index.ts', deepImport: '$1' },
  { name: 'notification', main: 'index.ts', deepImport: '$1' },
  { name: 'notification-client', main: 'index.ts', bareAliasPattern: true },
  { name: 'notification-contracts', main: 'index.ts', deepImport: '$1' },
  {
    name: 'notification-ui',
    main: 'index.ts',
    subpaths: [{ subpath: 'host', target: 'notification-ui-host.ts' }],
    bareAliasPattern: true,
  },
  { name: 'operations-contracts', main: 'index.ts', deepImport: '$1' },
  { name: 'patterns', main: 'index.ts', deepImport: '$1/index.ts' },
  { name: 'powersync-schema', main: 'index.ts' },
  { name: 'relation-contracts', main: 'index.ts', deepImport: '$1' },
  { name: 'reliable-messaging-contracts', main: 'index.ts', deepImport: '$1' },
  { name: 'repository', main: 'index.ts', deepImport: '$1' },
  { name: 'repository-client', main: 'index.ts', bareAliasPattern: true },
  { name: 'repository-contracts', main: 'index.ts', deepImport: '$1' },
  {
    name: 'repository-ui',
    main: 'index.ts',
    subpaths: [{ subpath: 'host', target: 'repository-ui-host.ts' }],
    deepImport: '$1',
  },
  { name: 'routine', main: 'index.ts', deepImport: '$1' },
  { name: 'routine-client', main: 'index.ts', bareAliasPattern: true },
  {
    name: 'routine-contracts',
    main: 'index.ts',
    subpaths: [{ subpath: 'method-library', target: 'method-library/index.ts' }],
    bareAliasPattern: true,
  },
  {
    name: 'routine-ui',
    main: 'index.ts',
    subpaths: [
      { subpath: 'host', target: 'routine-ui-host.ts' },
      {
        subpath: 'components/RoutineCapsulePreview',
        target: 'components/RoutineCapsulePreview.vue',
      },
      {
        subpath: 'components/RoutineUpcomingWidget',
        target: 'components/RoutineUpcomingWidget.vue',
      },
      {
        subpath: 'views/RoutineConfigurationView',
        target: 'views/RoutineConfigurationView.vue',
      },
      {
        subpath: 'composables/routineUpcomingCache',
        target: 'composables/routineUpcomingCache.ts',
      },
    ],
    bareAliasPattern: true,
  },
  { name: 'schedule', main: 'index.ts', deepImport: '$1' },
  { name: 'schedule-client', main: 'index.ts' },
  { name: 'schedule-contracts', main: 'index.ts', deepImport: '$1' },
  { name: 'schedule-orchestration', main: 'index.ts', deepImport: '$1' },
  {
    name: 'schedule-ui',
    main: 'index.ts',
    subpaths: [{ subpath: 'host', target: 'schedule-ui-host.ts' }],
  },
  { name: 'scheduler', main: 'index.ts', deepImport: '$1' },
  { name: 'setting-client', main: 'index.ts', bareAliasPattern: true },
  { name: 'setting-contracts', main: 'index.ts', deepImport: '$1', bareAliasPattern: true },
  {
    name: 'setting-ui',
    main: 'index.ts',
    subpaths: [{ subpath: 'host', target: 'setting-ui-host.ts' }],
    bareAliasPattern: true,
  },
  { name: 'shared-primitives', main: 'index.ts', deepImport: '$1' },
  { name: 'task', main: 'index.ts', deepImport: '$1/index.ts' },
  { name: 'task-contracts', main: 'index.ts', deepImport: '$1' },
  {
    name: 'task-ui',
    main: 'index.ts',
    subpaths: [{ subpath: 'host', target: 'task-ui-host.ts' }],
    deepImport: '$1',
  },
  { name: 'task-workspace-contracts', main: 'index.ts', deepImport: '$1' },
  { name: 'test-utils', main: 'index.ts', deepImport: '$1' },
  { name: 'time', main: 'index.ts', deepImport: '$1' },
  { name: 'transport-contracts', main: 'index.ts', deepImport: '$1' },
  { name: 'ui-core', main: 'index.ts', deepImport: '$1' },
  { name: 'ui-host-contracts', main: 'index.ts', bareAliasPattern: true },
  { name: 'ui-vue-shadcn', main: 'index.ts', deepImport: '$1' },
  { name: 'utils', main: 'index.ts', deepImport: '$1/index.ts' },
];

const WORKSPACE_PACKAGES_BY_NAME = new Map(
  WORKSPACE_PACKAGE_DEFINITIONS.map((definition) => [definition.name, definition]),
);

export function getWorkspacePackage(name: string): WorkspacePackageDefinition {
  const definition = WORKSPACE_PACKAGES_BY_NAME.get(name);
  if (!definition) {
    throw new Error(`Unknown workspace package alias definition: ${name}`);
  }
  return definition;
}

export interface WorkspaceAliasTarget {
  readonly packageName: string;
  /** `''` for the bare alias, `'(.*)'` for the deep import alias, otherwise an exact subpath. */
  readonly specifier: string;
  /** Target path relative to `packages/<packageName>/src`. */
  readonly target: string;
}

export interface WorkspaceAliasTargetOptions {
  readonly includeSubpaths?: boolean;
  readonly includeDeepImport?: boolean;
  readonly includeMain?: boolean;
}

/**
 * Expand package definitions into alias targets in the stable order
 * exact subpaths → deep import → bare import.
 */
export function createWorkspaceAliasTargets(
  packageNames: readonly string[],
  options: WorkspaceAliasTargetOptions = {},
): WorkspaceAliasTarget[] {
  const { includeSubpaths = true, includeDeepImport = true, includeMain = true } = options;

  return packageNames.flatMap((packageName) => {
    const definition = getWorkspacePackage(packageName);
    const targets: WorkspaceAliasTarget[] = [];

    if (includeSubpaths) {
      for (const { subpath, target } of definition.subpaths ?? []) {
        targets.push({ packageName, specifier: subpath, target });
      }
    }

    if (includeDeepImport && definition.deepImport) {
      targets.push({
        packageName,
        specifier: WORKSPACE_DEEP_IMPORT_SPECIFIER,
        target: definition.deepImport,
      });
    }

    if (includeMain) {
      targets.push({ packageName, specifier: '', target: definition.main });
    }

    return targets;
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Build the anchored alias matcher for a target produced by `createWorkspaceAliasTargets`. */
export function createWorkspaceAliasPattern(packageName: string, specifier: string): RegExp {
  const prefix = `@memoflow/${escapeRegExp(packageName)}`;

  if (specifier === '') {
    return new RegExp(`^${prefix}$`);
  }

  if (specifier === WORKSPACE_DEEP_IMPORT_SPECIFIER) {
    return new RegExp(`^${prefix}/${WORKSPACE_DEEP_IMPORT_SPECIFIER}$`);
  }

  return new RegExp(`^${prefix}/${escapeRegExp(specifier)}$`);
}
