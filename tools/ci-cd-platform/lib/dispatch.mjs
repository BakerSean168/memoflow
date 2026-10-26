import assert from 'node:assert/strict';
import { planServerShards } from './server-shards.mjs';

export const DISPATCH_JOB_IDS = Object.freeze([
  'lint',
  'unit-1',
  'unit-2',
  'unit-3',
  'build',
  'web-unit-1',
  'web-unit-2',
  'server-unit',
  'verification-children',
  'web-visual',
  'component-browser',
  'contract',
]);
export const LINT_TASKS = Object.freeze([
  {
    key: 'workspace:lint',
    command: ['node', 'tools/quality/lint-hybrid.mjs'],
  },
  {
    key: 'workspace:format',
    command: [
      'node',
      'tools/quality/fmt.mjs',
      '--check',
      '--all',
      '--receipt',
      'reports/quality/fmt-receipt.json',
    ],
  },
  { key: 'workspace:sync', command: ['pnpm', 'exec', 'nx', 'sync:check'] },
  { key: 'memoflow:governance-check', project: 'memoflow', target: 'governance-check' },
]);
export function nxTask(project, target, shard) {
  return {
    key: `${project}:${target}${shard ? `#${shard}` : ''}`,
    project,
    target,
    ...(shard ? { shard } : {}),
  };
}

export function buildDispatch(manifest) {
  const { scope, lanes, laneDetails, unitShards, full } = manifest;
  const fullVisual = manifest.event !== 'pull_request';
  assert(scope.tasks, 'CI scope requires exact task-based target selection');
  const jobs = Object.fromEntries(DISPATCH_JOB_IDS.map((id) => [id, []]));
  jobs.lint = [...LINT_TASKS];
  const tasks = (target) =>
    (scope.tasks[target] ?? []).filter((p) => p !== 'memoflow').map((p) => nxTask(p, target));
  const skippedTasks = (scope.selection.noopTasks ?? []).map((key) => ({
    key,
    reason: 'Nx noop target has no outputs or commands',
  }));
  jobs.build = tasks('build').filter((task) => !skippedTasks.some((skip) => skip.key === task.key));
  jobs.build.push(...tasks('typecheck'));
  // Governance owns these primary tests through its real Nx dependency graph.
  const governanceOwned = new Set(['governance-tools', 'test-system-v2']);
  // Explicit existing Nx owners, never infer a business layer from source paths.
  const webOwners = new Set(['app-vue', 'web']);
  const serverOwners = new Set(['api', 'database', 'migrator']);
  for (const shard of unitShards) {
    for (const task of shard.tasks) {
      if (governanceOwned.has(task.project)) continue;
      const owner = webOwners.has(task.project)
        ? task.shard === '2/2'
          ? 'web-unit-2'
          : 'web-unit-1'
        : serverOwners.has(task.project)
          ? 'server-unit'
          : shard.id;
      jobs[owner].push(nxTask(task.project, 'test', task.shard));
    }
  }
  if (laneDetails.contract.required) jobs.contract = tasks('test:contract');
  if (scope.browserRequired)
    jobs['component-browser'] = [nxTask('ui-storybook', 'test:interaction')];
  // test:boundary is an aggregate alias for test:ipc + test:main, not another primary suite.
  jobs['verification-children'] = [
    ...tasks('test:boundary').filter((t) => t.project !== 'desktop'),
    ...tasks('test:ipc'),
    ...tasks('test:main'),
    ...tasks('test:smoke'),
    ...tasks('test:integration'),
    ...(lanes.performance ? tasks('test:perf') : []),
  ];
  // PR/Main keep source-only visuals; Provider acceptance belongs to Nightly Audit.
  if (lanes.web) {
    jobs['web-visual'] = manifest.webShards.shards.flatMap((shard, index) =>
      fullVisual || index === 0
        ? [
            {
              ...nxTask('web', 'e2e:visual-regression', fullVisual ? shard.id : undefined),
              executor: fullVisual ? 'visual-full' : 'visual-pr',
            },
          ]
        : [],
    );
  }
  // Runtime scripts are required by the existing main candidate artifact contract.
  if (full) jobs.build.push(nxTask('database', 'runtime-scripts:build'));
  return {
    kind: 'ci-dispatch-v2',
    version: 2,
    selection: scope.selection,
    skippedTasks,
    nightlyTasks: tasks('e2e:ai-provider').map((task) => ({
      key: task.key,
      workflow: '.github/workflows/nightly-audit.yml',
      reason: 'Full Provider journey retained in the independent Nightly Audit',
    })),
    serverShards: planServerShards(jobs['verification-children']),
    jobs: Object.fromEntries(
      Object.entries(jobs).map(([job, tasks]) => [
        job,
        {
          required: tasks.length > 0,
          skipReason: tasks.length
            ? null
            : job === 'component-browser' && scope.tasks['test:interaction']?.length
              ? 'Nx selected the combined project; this diff has no browser resource inputs, and its primary Unit tasks remain selected'
              : 'no affected primary tasks for this resource pool',
          tasks,
        },
      ]),
    ),
    resources: {
      lint: ['node', 'pnpm'],
      Test: ['node', 'pnpm'],
      'web-unit-1': ['node', 'pnpm'],
      'web-unit-2': ['node', 'pnpm'],
      'server-unit': ['node', 'pnpm'],
      'component-browser': ['node', 'pnpm', 'chromium'],
      'web-visual': ['node', 'pnpm', 'chromium', 'visual-fonts'],
      'verification-children': ['node', 'pnpm', 'postgres'],
    },
    ownership: {
      'governance-tools:test': 'lint',
      'test-system-v2:test': 'lint',
      'desktop:test:boundary': 'verification-children (test:ipc + test:main)',
      'contracts:test': laneDetails.contract.required ? 'contract (test:contract)' : 'Test pool',
    },
  };
}

export function validateDispatch(manifest) {
  const plan = manifest.dispatch;
  assert.equal(plan?.kind, 'ci-dispatch-v2', 'missing versioned CI dispatch');
  assert.equal(plan.version, 2, 'unsupported CI dispatch');
  assert.deepEqual(Object.keys(plan.jobs).sort(), [...DISPATCH_JOB_IDS].sort(), 'CI job map drift');
  // Recompute ownership and required/skip from the selected tasks. A self-digest
  // alone cannot detect a well-formed plan that silently omits an affected task.
  assert.deepEqual(plan, buildDispatch(manifest), 'CI dispatch differs from selected tasks');
  const primaryOwners = new Map();
  for (const [job, detail] of Object.entries(plan.jobs)) {
    assert.equal(detail.required, detail.tasks.length > 0, `${job}:empty plan`);
    assert.equal(
      new Set(detail.tasks.map((t) => t.key)).size,
      detail.tasks.length,
      `${job}:duplicate task`,
    );
    for (const task of detail.tasks.filter((task) => /^(?:test|e2e)(?::|$)/u.test(task.target))) {
      assert(!primaryOwners.has(task.key), `${task.key}:multiple primary owners`);
      primaryOwners.set(task.key, job);
    }
  }
  return plan;
}

export const VISUAL_PR_GREP = String.raw`1280px light$|440px dark$|840px light$|web: |desktop: (shell\.|foundation\.)|#484 (web .*1280px|desktop .*440px)$|UI-9002|post-vNext|preserve the active Task draft \(light\)`;
export function taskCommand(task) {
  if (task.command) return task.command;
  if (task.executor === 'web-shard')
    return ['node', 'tools/test-system-v2/run-web-shard.mjs', task.shard];
  const args = [
    'pnpm',
    'exec',
    'nx',
    'run',
    `${task.project}:${task.target}`,
    '--outputStyle=static',
  ];
  if (task.executor === 'visual-pr') args.push('--', '--grep', VISUAL_PR_GREP);
  else if (task.shard)
    args.push(`--shard=${task.shard}`, ...(task.target === 'test' ? ['--maxWorkers=2'] : []));
  return args;
}
export function batchCommand(tasks) {
  return tasks.length > 1
    ? [
        'pnpm',
        'exec',
        'nx',
        'run-many',
        '-t',
        tasks[0].target,
        `--projects=${tasks.map((t) => t.project).join(',')}`,
        '--parallel=3',
        '--outputStyle=static',
      ]
    : taskCommand(tasks[0]);
}

/** One exact mixed-target Nx graph, no project/target cross product. */
export function buildCommand(tasks) {
  return ['node', 'tools/ci-cd-platform/run-nx-build-tasks.mjs', ...tasks.map((t) => t.key)];
}
