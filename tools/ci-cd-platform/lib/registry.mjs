/**
 * CI/CD capabilities are data, not workflow-specific branches.
 * A new execution lane must register its contract here before it can be used
 * by a workflow or an adapter.
 */

export const REGISTRY_VERSION = 1;

const lane = (definition) =>
  Object.freeze({
    ...definition,
    inputs: Object.freeze([...definition.inputs]),
    outputs: Object.freeze([...definition.outputs]),
    capabilities: Object.freeze([...definition.capabilities]),
    cache: Object.freeze({
      read: Object.freeze([...(definition.cache?.read ?? [])]),
      write: Object.freeze([...(definition.cache?.write ?? [])]),
    }),
    environment: Object.freeze({ ...definition.environment }),
    failurePolicy: Object.freeze({ ...definition.failurePolicy }),
  });

export const LANE_REGISTRY = Object.freeze({
  governance: lane({
    owner: 'platform-governance',
    capabilities: ['node', 'pnpm'],
    inputs: ['delivery-manifest'],
    outputs: ['lane-result', 'governance-report'],
    environment: { isolation: 'none', database: 'none' },
    cache: { read: ['pnpm', 'nx'], write: ['pnpm', 'nx'] },
    failurePolicy: { retry: 'none', timeoutMinutes: 15 },
  }),
  validate: lane({
    owner: 'platform-validation',
    capabilities: ['node', 'pnpm'],
    inputs: ['delivery-manifest'],
    outputs: ['lane-result', 'build-artifact', 'test-evidence'],
    environment: { isolation: 'workspace', database: 'none' },
    cache: { read: ['pnpm', 'nx'], write: ['pnpm', 'nx'] },
    failurePolicy: { retry: 'infrastructure-only', timeoutMinutes: 30 },
  }),
  boundary: lane({
    owner: 'platform-boundary',
    capabilities: ['node', 'pnpm', 'postgres'],
    inputs: ['delivery-manifest'],
    outputs: ['lane-result', 'test-evidence'],
    environment: { isolation: 'dedicated', database: 'ephemeral-postgres' },
    cache: { read: ['pnpm', 'nx'], write: ['pnpm', 'nx'] },
    failurePolicy: { retry: 'infrastructure-only', timeoutMinutes: 30 },
  }),
  integration: lane({
    owner: 'platform-integration',
    capabilities: ['node', 'pnpm', 'postgres'],
    inputs: ['delivery-manifest'],
    outputs: ['lane-result', 'test-evidence'],
    environment: { isolation: 'dedicated', database: 'ephemeral-postgres' },
    cache: { read: ['pnpm'], write: [] },
    failurePolicy: { retry: 'infrastructure-only', timeoutMinutes: 30 },
  }),
  web: lane({
    owner: 'platform-web',
    capabilities: ['node', 'pnpm', 'playwright', 'postgres'],
    inputs: ['delivery-manifest', 'api-artifact', 'api-runtime-closure', 'database-artifact'],
    outputs: ['lane-result', 'test-evidence'],
    environment: { isolation: 'dedicated', database: 'ephemeral-postgres', browser: 'chromium' },
    cache: { read: ['pnpm', 'playwright'], write: ['pnpm', 'playwright'] },
    failurePolicy: { retry: 'infrastructure-only', timeoutMinutes: 30 },
  }),
  coverage: lane({
    owner: 'platform-quality',
    capabilities: ['node', 'pnpm'],
    inputs: ['delivery-manifest'],
    outputs: ['lane-result', 'coverage-evidence'],
    environment: { isolation: 'workspace', database: 'none' },
    cache: { read: ['pnpm', 'nx'], write: [] },
    failurePolicy: { retry: 'none', timeoutMinutes: 30 },
  }),
  performance: lane({
    owner: 'platform-quality',
    capabilities: ['node', 'pnpm'],
    inputs: ['delivery-manifest'],
    outputs: ['lane-result', 'performance-evidence'],
    environment: { isolation: 'dedicated', database: 'none' },
    cache: { read: ['pnpm'], write: [] },
    failurePolicy: { retry: 'none', timeoutMinutes: 30 },
  }),
});

export const ARTIFACT_REGISTRY = Object.freeze({
  api: Object.freeze({ path: 'apps/api/dist', requiredFor: ['web', 'production'] }),
  web: Object.freeze({ path: 'dist/apps/web', requiredFor: ['production'] }),
  migrator: Object.freeze({ path: 'apps/migrator/dist', requiredFor: ['production'] }),
  database: Object.freeze({ path: 'packages/database/dist', requiredFor: ['web', 'production'] }),
  'api-runtime-closure': Object.freeze({
    path: 'api-runtime-closure',
    requiredFor: ['web', 'production'],
  }),
  'database-runtime': Object.freeze({
    path: 'packages/database/dist/runtime-scripts',
    requiredFor: ['production'],
  }),
});

export function getLaneDefinition(name) {
  const definition = LANE_REGISTRY[name];
  if (!definition) throw new Error(`Unknown delivery lane: ${name}`);
  return definition;
}

export function getArtifactDefinition(name) {
  const definition = ARTIFACT_REGISTRY[name];
  if (!definition) throw new Error(`Unknown delivery artifact: ${name}`);
  return definition;
}

export function assertRegistry() {
  for (const [name, definition] of Object.entries(LANE_REGISTRY)) {
    if (!definition.owner || definition.capabilities.length === 0) {
      throw new Error(`Lane ${name} must declare owner and capabilities`);
    }
    if (!definition.inputs.includes('delivery-manifest')) {
      throw new Error(`Lane ${name} must consume delivery-manifest`);
    }
    if (!definition.outputs.includes('lane-result')) {
      throw new Error(`Lane ${name} must produce lane-result`);
    }
    if (!['none', 'workspace', 'dedicated'].includes(definition.environment.isolation)) {
      throw new Error(`Lane ${name} must declare a supported isolation policy`);
    }
    if (
      !['none', 'infrastructure-only'].includes(definition.failurePolicy.retry) ||
      !Number.isInteger(definition.failurePolicy.timeoutMinutes) ||
      definition.failurePolicy.timeoutMinutes <= 0
    ) {
      throw new Error(`Lane ${name} has an invalid failure policy`);
    }
  }
  for (const [name, definition] of Object.entries(ARTIFACT_REGISTRY)) {
    if (!definition.path || !Array.isArray(definition.requiredFor)) {
      throw new Error(`Artifact ${name} has an invalid registry entry`);
    }
  }
  const productionArtifacts = Object.entries(ARTIFACT_REGISTRY)
    .filter(([, definition]) => definition.requiredFor.includes('production'))
    .map(([name]) => name)
    .sort();
  if (
    productionArtifacts.join(',') !==
    'api,api-runtime-closure,database,database-runtime,migrator,web'
  ) {
    throw new Error('production artifact closure is incomplete or ambiguous');
  }
  return true;
}
