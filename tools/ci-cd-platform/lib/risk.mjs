const RISK_RANK = {
  docs: 0,
  package: 1,
  desktop: 2,
  runtime: 3,
  'web-flow': 4,
  root: 5,
  release: 6,
};

/**
 * Non-executable documentation. A file matching this rule is classified as
 * docs only: free-text words such as "database" or "e2e" inside a Markdown
 * path must not select runtime or browser lanes. Governance always runs.
 */
const DOCS_RULE = {
  level: 'docs',
  reason: 'documentation or non-executable metadata changed',
  test: (file) =>
    /^(?:docs\/|LICENSE(?:\.[^/]+)?$|[^/]+\.md$|\.github\/(?:prompts\/[^/]+\.md|copilot-instructions\.md)$)/iu.test(
      file,
    ),
};

/**
 * Files that only execute inside the Desktop (Electron main/preload, packaging,
 * native scripts). They are excluded from the Web Flow affected query because
 * the Nx project graph cannot see that `web` only consumes Desktop renderer
 * styles (visual regression), not the main process.
 */
export const DESKTOP_ONLY_PATTERN =
  /^(?:apps\/desktop\/(?!src\/renderer\/)|packages\/repository\/src\/electron\/)/u;

export function isDesktopOnlyFile(file) {
  return DESKTOP_ONLY_PATTERN.test(file);
}

/** Changed files that can influence the Web Flow lane through the Nx graph. */
export function webFlowCandidateFiles(changedFiles) {
  return changedFiles.filter((file) => !isDesktopOnlyFile(file) && !DOCS_RULE.test(file));
}

const RULES = [
  {
    level: 'release',
    reason: 'release or deployment configuration changed',
    test: (file) =>
      /^(\.github\/workflows\/(?:release(?:-[^/]+)?|publish-images|deploy-production)\.yml|deployment\/production\/|(?:tools\/docker\/|tools\/ci-cd-platform\/(?:release-tools\/|production-manifest\.mjs))|Dockerfile)/u.test(
        file,
      ),
  },
  {
    level: 'root',
    reason: 'workspace, dependency, CI, or Nx configuration changed',
    test: (file) =>
      /(^|\/)(pnpm-lock\.yaml|package\.json|nx\.json|tsconfig[^/]*\.json|\.github\/workflows\/|\.github\/actions\/)/u.test(
        file,
      ),
  },
  {
    level: 'desktop',
    reason: 'Desktop, Electron, or native packaging surface changed',
    test: (file) =>
      /(^apps\/desktop\/|^packages\/repository\/src\/electron\/|electron-builder|desktop-release)/iu.test(
        file,
      ),
  },
  {
    level: 'runtime',
    reason: 'API, database, Prisma, IPC, or integration runtime changed',
    test: (file) =>
      /(^apps\/api\/|^apps\/migrator\/|prisma|database|integration|smoke)/iu.test(file),
  },
  {
    level: 'web-flow',
    reason: 'Web application or browser flow changed',
    // Anchored: Desktop e2e scripts (apps/desktop/scripts/*e2e*) and Desktop
    // Playwright collectors belong to the Desktop surface, not Web Flow.
    test: (file) => /^apps\/web\//u.test(file),
  },
  {
    level: 'web-flow',
    reason: 'Web Flow shard timing history changed',
    test: (file) => file === 'tools/test-system-v2/web-spec-durations.json',
  },
  {
    level: 'package',
    reason: 'test harness ownership metadata changed',
    // Inventory / ownership / retirement registries are validated by the
    // governance lane and the test-system-v2 unit tests (Nx-affected).
    test: (file) =>
      /^tools\/test-system-v2\/(?:test-inventory|e2e-ownership|e2e-retirement)\.json$/u.test(file),
  },
  {
    level: 'package',
    reason: 'application or shared package source changed',
    test: (file) => /^(apps|packages)\//u.test(file),
  },
];

export function classifyRisk(changedFiles) {
  const levels = new Map();
  for (const file of changedFiles) {
    const matching = DOCS_RULE.test(file) ? [DOCS_RULE] : RULES.filter((rule) => rule.test(file));
    // Fail closed: an unknown path is treated as a root (full) change.
    const rules =
      matching.length > 0 ? matching : [{ level: 'root', reason: 'unclassified file changed' }];
    for (const rule of rules) {
      levels.set(rule.level, (levels.get(rule.level) ?? new Set()).add(rule.reason));
    }
  }

  if (levels.size === 0) {
    return {
      level: 'docs',
      reasons: ['no changed files; treating as docs-only'],
      matchedLevels: ['docs'],
    };
  }

  const matchedLevels = [...levels.keys()].sort(
    (left, right) => RISK_RANK[right] - RISK_RANK[left],
  );
  return {
    level: matchedLevels[0],
    matchedLevels,
    reasons: [...new Set([...levels.values()].flatMap((reasons) => [...reasons]))].sort(),
  };
}

/**
 * Each lane is decided on its own dimension. No surface suppresses another:
 * a mixed Desktop + shared UI change keeps both the Desktop boundary and Web
 * Flow. `scope.webFlow` already excludes Desktop-only files (see
 * webFlowCandidateFiles), so Desktop-only diffs do not select Web Flow.
 */
export function selectLanes({ risk, scope, event = 'pull_request', full = scope.full === true }) {
  const matched = new Set(risk.matchedLevels ?? [risk.level]);
  const root = matched.has('root') || matched.has('release');
  const fullAudit = full || event === 'schedule' || event === 'workflow_dispatch';
  const has = (values) => fullAudit || (Array.isArray(values) && values.length > 0);
  return {
    governance: true,
    // Documentation-only changes still need governance, but do not need to
    // reserve validation runners. Full audits always exercise every lane.
    validate: fullAudit || risk.level !== 'docs',
    boundary: root || has(scope.boundary) || has(scope.smoke),
    integration: root || has(scope.integration),
    web: fullAudit || root || matched.has('web-flow') || scope.webFlow === true,
    // Coverage instrumentation left PR/Main CI: the nightly audit measures
    // coverage on its own schedule (DELIVERY_FORCE_LANES=coverage) and no
    // fixed percentage gates runs here. The lane key stays in the manifest
    // contract so CI Check can expect the explicit skip.
    coverage: false,
    performance: event !== 'pull_request' && (root || has(scope.perf)),
  };
}

const FORMAT_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.mjs',
  '.cjs',
  '.jsx',
  '.vue',
  '.json',
  '.md',
  '.css',
  '.scss',
  '.less',
  '.html',
  '.yml',
  '.yaml',
]);
const LINT_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.mjs',
  '.cjs',
  '.jsx',
  '.vue',
]);
const TYPE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts', '.vue']);
const STORY_PATTERN = /(?:\.stories\.[^/]+$|^apps\/storybook\/)/u;
const CONTRACT_PATTERN =
  /^(?:packages\/contracts\/|apps\/api\/src\/shared\/infrastructure\/openapi\/|packages\/[^/]+\/src\/contracts\/)/u;

function extensionOf(file) {
  const dot = file.lastIndexOf('.');
  return dot > file.lastIndexOf('/') ? file.slice(dot) : '';
}

/**
 * Multi-dimensional capability impact of a change set (VNext Q2): instead of
 * collapsing a diff into a single risk level, report which quality
 * capabilities it touches and through which files/projects. Lane selection
 * keeps using classifyRisk/selectLanes; capabilities feed the manifest's
 * laneDetails plan and stage-gate verification.
 */
export function classifyCapabilities({ changedFiles, scope }) {
  const pick = (set) => changedFiles.filter((file) => set.has(extensionOf(file)));
  return {
    fmt: { files: pick(FORMAT_EXTENSIONS) },
    lint: { files: pick(LINT_EXTENSIONS) },
    typecheck: { files: pick(TYPE_EXTENSIONS) },
    componentBrowser: {
      // A migrated contract must run when its production component changes,
      // not only when the Story itself changes. Nx supplies transitive package
      // consumers; the Web-owned auth view is additionally an explicit input.
      // Migrated feature UI packages are production views too: their Story
      // contracts live in ui-storybook, so a component edit there must run the
      // component browser lane even when the changed project is the library.
      files: changedFiles.filter(
        (file) =>
          STORY_PATTERN.test(file) ||
          file.startsWith('apps/web/src/auth/') ||
          file.startsWith('packages/app-vue/src/') ||
          file.startsWith('packages/goal-ui/src/') ||
          file.startsWith('packages/ui-vue-shadcn/src/') ||
          (scope?.projects ?? []).includes('ui-storybook'),
      ),
    },
    contract: { files: changedFiles.filter((file) => CONTRACT_PATTERN.test(file)) },
    unit: { files: [], projects: scope?.unit ?? [] },
    integration: { files: [], projects: scope?.integration ?? [] },
    boundary: { files: [], projects: scope?.boundary ?? [] },
    coverage: { files: [], projects: scope?.coverage ?? [] },
    performance: { files: [], projects: scope?.perf ?? [] },
    web: { files: scope?.webFlowFiles ?? [] },
    governance: { files: [] },
    validate: { files: [] },
  };
}
