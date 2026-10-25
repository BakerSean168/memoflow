import assert from 'node:assert/strict';
import { planServerShards } from './server-shards.mjs';

export const DISPATCH_JOB_IDS = Object.freeze([
  'lint',
  'unit-1',
  'unit-2',
  'unit-3',
  'typecheck',
  'build',
  'build-backend',
  'verification-children',
  'web-specialized',
  'web-visual',
  'component-browser',
  'contract',
]);
export const LINT_TASKS = Object.freeze([
  {
    key: 'workspace:lint',
    command: [
      'pnpm',
      'exec',
      'nx',
      'run-many',
      '-t',
      'lint',
      '--all',
      '--parallel=3',
      '--outputStyle=static',
    ],
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
  jobs.typecheck = tasks('typecheck');
  // Governance owns these primary tests through its real Nx dependency graph.
  const governanceOwned = new Set(['governance-tools', 'test-system-v2']);
  for (const shard of unitShards)
    jobs[shard.id] = shard.tasks
      .filter((t) => !governanceOwned.has(t.project))
      .map((t) => nxTask(t.project, 'test', t.shard));
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
  // Source-only UI checks have no build edge. Only acceptance consumes API/DB artifacts.
  if (lanes.web) {
    jobs['build-backend'] = [
      nxTask('api', 'build'),
      nxTask('database', 'build'),
      nxTask('database', 'runtime-scripts:build'),
    ];
    jobs['web-specialized'] = manifest.webShards.shards.map((shard) => ({
      ...nxTask('web', 'e2e:ai-provider', shard.id),
      executor: 'web-shard',
      shard: shard.id,
    }));
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
    kind: 'ci-dispatch-v1',
    version: 1,
    selection: scope.selection,
    skippedTasks,
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
      'component-browser': ['node', 'pnpm', 'chromium'],
      'web-visual': ['node', 'pnpm', 'chromium', 'visual-fonts'],
      'verification-children': ['node', 'pnpm', 'postgres'],
      'web-specialized': [
        'node',
        'pnpm',
        'chromium',
        'postgres',
        'api-artifact',
        'database-artifact',
      ],
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
  assert.equal(plan?.kind, 'ci-dispatch-v1', 'missing versioned CI dispatch');
  assert.equal(plan.version, 1, 'unsupported CI dispatch');
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
