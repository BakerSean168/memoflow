import { createRequire } from 'node:module';
import path from 'node:path';
import { classifyRisk, webFlowCandidateFiles } from './risk.mjs';
import { selectCiTasks } from './task-selection.mjs';

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

export async function detectScope({
  root: _root = process.cwd(),
  base = process.env.NX_BASE,
  head = process.env.NX_HEAD,
  full = false,
  files,
} = {}) {
  if (!full && !Array.isArray(files)) {
    throw new Error('detectScope requires the changed file list for non-full scope');
  }

  const risk = classifyRisk(files ?? []);
  const global =
    full ||
    isGlobalSurface((files ?? []).filter((file) => classifyRisk([file]).level !== 'docs')) ||
    ['root', 'release'].includes(risk.level);
  const selection = await selectCiTasks({ files: files ?? [], base, head, full: global });
  const effectiveFull = global || selection.fallback !== null;
  const targets = selection.targets;
  const list = (name) => targets[name].filter((p) => p !== 'memoflow');
  // Resource policy only: never use semantic layers to discard affected Unit,
  // Build, Types or Integration tasks. The combined domain projects stay intact.
  const browserInput = (files ?? []).some(
    (file) =>
      /^(apps\/(web|storybook)\/|apps\/desktop\/src\/renderer\/)/u.test(file) ||
      (file.startsWith('packages/') &&
        !/^packages\/[^/]+\/src\/(?:server|infrastructure-server|electron)\//u.test(file)),
  );
  const webFlowFiles = webFlowCandidateFiles(files ?? []);
  const webFlow =
    effectiveFull ||
    (browserInput &&
      targets['e2e:ai-provider'].includes('web') &&
      webFlowFiles.some((f) => !f.includes('.stories.')) &&
      !(files ?? []).every((f) => f.startsWith('apps/storybook/')));
  return {
    version: SCOPE_VERSION,
    base: base ?? null,
    head: head ?? null,
    full: effectiveFull,
    projects: selection.projects,
    tasks: targets,
    selection: {
      version: 1,
      engine: 'nx-task-inputs',
      fallback: selection.fallback,
      noopTasks: selection.noopTasks,
    },
    unit: list('test').filter((p) => p !== 'ui-storybook'),
    // Coverage measurements are selected separately by Nightly Audit.
    coverage: list('test:coverage'),
    smoke: list('test:smoke'),
    integration: list('test:integration'),
    boundary: list('test:boundary'),
    perf: list('test:perf'),
    webFlow,
    webFlowFiles,
    desktopFlow:
      targets['test:main'].includes('desktop') || targets['test:ipc'].includes('desktop'),
    browserRequired:
      (effectiveFull || browserInput) && targets['test:interaction'].includes('ui-storybook'),
  };
}
