// Classification vocabulary is orthogonal to the Test Inventory V3 primary suites.
// These are semantic categories, not additional Nx targets.
export const ARCHITECTURE_VERSION = 2;
export const TEST_TYPES = Object.freeze([
  'unit',
  'component',
  'contract',
  'integration',
  'boundary',
  'e2e',
  'performance',
]);
export const VERIFICATION_DIMENSIONS = Object.freeze([
  'functional',
  'visual',
  'accessibility',
  'security',
  'reliability',
  'ai-evaluation',
]);
export const EXECUTION_ENVIRONMENTS = Object.freeze([
  'node',
  'simulated-dom',
  'real-browser',
  'electron',
  'database',
  'external-service',
]);
export const EXECUTION_PHASES = Object.freeze(['local', 'pr', 'main', 'nightly', 'release']);
export const PHASE_STATUSES = Object.freeze(['available', 'conditional', 'not-confirmed']);
export const TEST_ROLES = Object.freeze(['behavior', 'smoke', 'governance', 'source-constraint']);

export function countBy(items, getter) {
  const counts = new Map();
  for (const item of items) {
    const values = getter(item);
    for (const value of Array.isArray(values) ? values : [values]) {
      if (value == null) continue;
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  return Object.fromEntries([...counts.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

function has(source, pattern) {
  return pattern.test(source);
}

export function inferVerificationDimensions(source, testType, testRole) {
  const detected = new Map();
  const add = (dimension, basis) => {
    if (!detected.has(dimension)) detected.set(dimension, basis);
  };
  // This denotes test intent, never verified quality/coverage.
  if (testType && testRole !== 'governance' && testRole !== 'source-constraint') {
    add('functional', 'product-test-intent');
  }
  if (
    has(source, /\btoHaveScreenshot\s*\(/u) ||
    has(source, /\btoMatchSnapshot\s*\([^)]*\.(?:png|jpg|jpeg|webp)/u)
  ) {
    add('visual', 'image-snapshot-assertion-signal');
  } else if (has(source, /\bboundingBox\s*\(/u) && has(source, /\b(?:expect|assert)\s*\(/u)) {
    add('visual', 'geometry-assertion-signal');
  }

  if (
    has(source, /\btoHaveAccessible(?:Name|Description)\s*\(/u) ||
    has(source, /\btoBeFocused\s*\(/u) ||
    has(source, /\btoHaveAttribute\s*\(\s*['"]aria-[a-z-]+/u) ||
    has(source, /\battributes\s*\(\s*['"]aria-[a-z-]+/u) ||
    has(source, /\b(?:axe|checkA11y|injectAxe)\s*\(/u)
  ) {
    add('accessibility', 'accessibility-assertion-signal');
  }
  if (
    has(source, /\b(?:expect|assert)\b/u) &&
    has(
      source,
      /\b(?:unauthori[sz]ed|forbidden|cross.tenant|cross.account|isolation|secret.free|permission.denied|access.denied|401|403)\b/iu,
    )
  ) {
    add('security', 'authorization-or-secret-test-signal');
  }
  if (
    has(source, /\b(?:expect|assert)\b/u) &&
    has(
      source,
      /\b(?:restart|recover(?:y|ed|able)?|rollback|idempoten(?:t|cy)|reconnect|offline|resume|data.loss)\b/iu,
    )
  ) {
    add('reliability', 'restart-recovery-or-idempotency-test-signal');
  }
  // Testing the presence/wire format of an evaluation report is not an AI evaluation.
  // An actual dataset/check execution is required for even a candidate tag.
  if (
    has(source, /\brunAIEvaluation\s*\(/u) &&
    (has(source, /\bAIEvalDataset\b/u) || has(source, /\bcompareAIEvaluationReports\s*\(/u))
  ) {
    add('ai-evaluation', 'eval-dataset-and-executor-signal');
  }
  const dimensions = [...detected.keys()];
  return {
    dimensions,
    evidence: dimensions.map((dimension) => ({
      dimension,
      basis: detected.get(dimension),
      reviewStatus: 'candidate',
    })),
    evaluationMode: detected.has('ai-evaluation')
      ? has(source, /\bRecordedReplayAIEvalExecutor\b/u)
        ? 'recorded-replay'
        : 'unverified'
      : null,
  };
}

export function inferEnvironment(entry, source, collector) {
  const directive = source.match(/@vitest-environment\s+([a-z-]+)/u)?.[1] ?? null;
  const suite = entry.primarySuite;
  const runner = collector?.runner ?? (suite === 'e2e' ? 'playwright' : 'node-test');
  let runtime = 'node';
  let basis = 'node-test-or-vitest-default';
  if (suite === 'e2e') {
    runtime = entry.path.startsWith('apps/desktop/') ? 'electron' : 'real-browser';
    basis = 'playwright-collector-and-application';
  } else if (directive === 'happy-dom' || directive === 'jsdom') {
    runtime = 'simulated-dom';
    basis = 'vitest-file-directive';
  } else if (directive === 'node') {
    basis = 'vitest-file-directive';
  } else if (
    collector?.configuredVitestEnvironment === 'happy-dom' ||
    collector?.configuredVitestEnvironment === 'jsdom'
  ) {
    runtime = 'simulated-dom';
    basis = 'vitest-collector-config';
  } else if (collector?.configuredVitestEnvironment === 'node') {
    basis = 'vitest-collector-config';
  }
  const dependencyCandidates = [];
  if (suite === 'integration') {
    const dbWiring =
      /\b(?:getPrisma|seedAccount|cleanTaskTables|PrismaClient|prisma\.\$|prisma\s*[,)}]|TEST_DATABASE_URL|TEST_DB_HOST|pg\.Pool|pg\.Client)\b|@memoflow\/database|@prisma\/adapter-pg|integration-helpers|test-utils\/setup\/database/iu.test(
        source,
      );
    const redisWiring = /\b(?:Redis|ioredis|EAG_TEST_REDIS_URL|redis-cli)\b/u.test(source);
    if (dbWiring) {
      dependencyCandidates.push({
        environment: 'database',
        basis: 'database client/fixture declared in test source; live connection not verified',
        reviewStatus: 'candidate',
      });
    } else if (redisWiring) {
      dependencyCandidates.push({
        environment: 'external-service',
        basis: 'Redis service/container declared in source; live execution not verified',
        reviewStatus: 'candidate',
      });
    }
  }
  // The external-service dimension must be confirmed explicitly for live providers.
  return {
    runtime,
    basis,
    status: basis === 'node-test-or-vitest-default' ? 'inferred' : 'configured-candidate',
    dependencyCandidates,
    confirmedDependencies: [],
    runner,
    directive,
  };
}
