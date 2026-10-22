import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import path from 'node:path';
import { webFlowCandidateFiles } from './risk.mjs';

const exec = promisify(execFile);
const require = createRequire(import.meta.url);
export const SCOPE_VERSION = 1;

export const PROJECT_LAYERS = {
  // apps
  web: 'app:web',
  desktop: 'app:desktop',
  api: 'app:backend',
  migrator: 'app:backend',
  mobile: 'app:mobile',
  'ui-storybook': 'app:ui',
  // ui layer
  'app-vue': 'ui',
  'ui-vue-shadcn': 'ui',
  'ui-core': 'ui',
  'app-react': 'ui',
  'ui-react-native': 'ui',
  // domain layer
  relation: 'domain',
  account: 'domain',
  ai: 'domain',
  'data-portability': 'domain',
  goal: 'domain',
  label: 'domain',
  notification: 'domain',
  reminder: 'domain',
  schedule: 'domain',
  'schedule-orchestration': 'domain',
  setting: 'domain',
  task: 'domain',
  // infra layer
  'agent-gateway': 'infra',
  'cloud-auth': 'infra',
  database: 'infra',
  'http-client': 'infra',
  'ipc-client': 'infra',
  repository: 'infra',
  scheduler: 'infra',
  // shared layer
  assets: 'shared',
  contracts: 'shared',
  'domain-shared': 'shared',
  patterns: 'shared',
  'powersync-schema': 'shared',
  time: 'shared',
  utils: 'shared',
  // ci / testing
  'ci-cd-platform': 'ci',
  'governance-tools': 'testing',
  'nx-test-system': 'testing',
  'test-system-v2': 'testing',
  '@memoflow/test-utils': 'testing',
};

export const GLOBAL_SURFACE_PATTERNS = [
  /^\.github\//u,
  /^tools\/(?:ci-cd-platform|test-system-v2|governance|ci|docker|build|mcp)\//u,
  /^(?:package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|nx\.json|tsconfig[^/]*\.json|eslint\.config\.[^/]+|\.npmrc)$/u,
  /^(?:packages\/contracts|packages\/database)\//u,
  /(^|\/)prisma(\/|$)/iu,
];

export function isGlobalSurface(files) {
  if (!Array.isArray(files) || files.length === 0) return false;
  return files.some(
    (file) => GLOBAL_SURFACE_PATTERNS.some((pattern) => pattern.test(file)) || !file.includes('/'),
  );
}

export function resolveProjectOwner(file) {
  if (file.startsWith('apps/')) {
    const seg = file.split('/')[1];
    if (seg === 'storybook') return 'ui-storybook';
    return seg;
  }
  if (file.startsWith('packages/')) {
    const seg = file.split('/')[1];
    if (seg === 'test-utils') return '@memoflow/test-utils';
    return seg;
  }
  if (file.startsWith('tools/')) {
    return file.split('/')[1];
  }
  return 'memoflow';
}

export function createNxShowProjectsInvocation(args, cwd) {
  const root = path.resolve(cwd);
  const nxCli = require.resolve('nx/bin/nx.js', { paths: [root] });
  return {
    command: process.execPath,
    args: [nxCli, 'show', 'projects', ...args, '--json'],
    bootstrap: path.join(root, 'tools/ci/node-process-bootstrap.cjs'),
  };
}

async function nxProjects(args, cwd) {
  const invocation = createNxShowProjectsInvocation(args, cwd);
  try {
    const { stdout } = await exec(invocation.command, invocation.args, {
      cwd,
      maxBuffer: 4 * 1024 * 1024,
      env: {
        ...process.env,
        NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --require=${invocation.bootstrap}`.trim(),
      },
    });
    const projects = JSON.parse(stdout);
    if (!Array.isArray(projects) || !projects.every((project) => typeof project === 'string')) {
      throw new Error('Nx returned an invalid project list');
    }
    return projects.sort();
  } catch (error) {
    const detail = [error?.stderr, error?.stdout]
      .filter((value) => typeof value === 'string' && value.trim())
      .map((value) => value.trim())
      .join('\n')
      .slice(0, 4000);
    throw new Error(
      `Nx project scope query failed (${args.join(' ')}): ${detail || error?.message || 'unknown error'}`,
      { cause: error },
    );
  }
}

export async function detectScope({
  root = process.cwd(),
  base = process.env.NX_BASE,
  head = process.env.NX_HEAD,
  full = false,
  files,
} = {}) {
  if (!full && !Array.isArray(files)) {
    throw new Error('detectScope requires the changed file list for non-full scope');
  }

  // Safety valve: CI configuration, root config, contracts, database force full audit
  const isGlobal = full || (Array.isArray(files) && isGlobalSurface(files));
  const effectiveFull = isGlobal;

  const common = effectiveFull
    ? []
    : [
        '--affected',
        ...(base && head
          ? [`--base=${base}`, `--head=${head}`]
          : files && files.length > 0
            ? [`--files=${files.join(',')}`]
            : []),
      ];

  const projects = await nxProjects(common, root);
  const target = async (name) => nxProjects([...common, `--with-target=${name}`], root);

  if (effectiveFull) {
    const [rawUnit, coverage, smoke, integration, boundary, perf] = await Promise.all([
      target('test'),
      target('test:coverage'),
      target('test:smoke'),
      target('test:integration'),
      target('test:boundary'),
      target('test:perf'),
    ]);
    const unit = rawUnit.filter((p) => p !== 'ui-storybook' && p !== 'memoflow');
    const webFlowFiles = [];
    const webFlow = true;
    const desktopFlow = true;
    return {
      version: SCOPE_VERSION,
      base: base ?? null,
      head: head ?? null,
      full: true,
      projects,
      unit,
      coverage,
      smoke,
      integration,
      boundary,
      perf,
      webFlow,
      webFlowFiles,
      desktopFlow,
    };
  }

  // Affected non-global run: determine real owners and layers
  const touchedOwners = new Set(files.map(resolveProjectOwner).filter((p) => p !== 'memoflow'));
  const touchedLayers = new Set([...touchedOwners].map((p) => PROJECT_LAYERS[p]).filter(Boolean));

  const touchesBrowser = files.some(
    (f) =>
      f.startsWith('apps/web/') ||
      f.startsWith('packages/app-vue/') ||
      f.startsWith('packages/ui-vue-shadcn/') ||
      f.startsWith('packages/ui-core/') ||
      f.startsWith('packages/app-react/'),
  );

  const touchesDesktop = files.some(
    (f) => f.startsWith('apps/desktop/') || f.startsWith('packages/repository/src/electron/'),
  );

  const isPureBackend =
    touchedLayers.size > 0 &&
    [...touchedLayers].every((l) => ['domain', 'infra', 'app:backend'].includes(l));

  // Conservative diffusion: pure backend changes never light up the browser flow
  let webFlow = false;
  let webFlowFiles = [];
  if (touchesBrowser && !isPureBackend) {
    webFlowFiles = webFlowCandidateFiles(files);
    if (webFlowFiles.length > 0) {
      const webFlowProjects = await nxProjects(
        ['--affected', `--files=${webFlowFiles.join(',')}`],
        root,
      );
      webFlow = webFlowProjects.some((project) => ['web', 'api'].includes(project));
    }
  }

  const desktopFlow = touchesDesktop;

  const [rawUnit, coverage, smoke, rawIntegration, rawBoundary, perf] = await Promise.all([
    target('test'),
    target('test:coverage'),
    target('test:smoke'),
    target('test:integration'),
    touchesDesktop ? target('test:boundary') : Promise.resolve([]),
    target('test:perf'),
  ]);

  // Constrain unit tests: only affected projects within the touched layer(s)
  const unit = rawUnit.filter((project) => {
    if (project === 'ui-storybook' || project === 'memoflow') return false;
    if (touchedOwners.has(project)) return true;
    const projectLayer = PROJECT_LAYERS[project];
    return touchedLayers.has(projectLayer);
  });

  const boundary = rawBoundary.filter((p) => p !== 'memoflow');
  const integration = rawIntegration.filter((project) => {
    if (project === 'memoflow') return false;
    if (touchedOwners.has(project)) return true;
    const projectLayer = PROJECT_LAYERS[project];
    return (
      touchedLayers.has(projectLayer) ||
      (isPureBackend && ['domain', 'infra', 'app:backend'].includes(projectLayer))
    );
  });

  return {
    version: SCOPE_VERSION,
    base: base ?? null,
    head: head ?? null,
    full: false,
    projects,
    unit,
    coverage,
    smoke,
    integration,
    boundary,
    perf,
    webFlow,
    webFlowFiles,
    desktopFlow,
  };
}
