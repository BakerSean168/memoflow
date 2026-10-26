import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import ts from 'typescript';
import test from 'node:test';

const read = (file) => readFile(file, 'utf8');
const require = createRequire(import.meta.url);
const { getTargetInputs } = require('nx/src/hasher/task-hasher');
const trackedFiles = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);

function hashesFile(nxJson, project, target, file) {
  const node = {
    data: {
      ...project,
      targets: {
        [target]: { ...nxJson.targetDefaults[target], ...project.targets[target] },
      },
    },
  };
  const { selfInputs } = getTargetInputs(nxJson, node, target);
  const patterns = selfInputs.map((pattern) =>
    pattern.replaceAll('{workspaceRoot}/', '').replaceAll('{projectRoot}', project.root),
  );
  return (
    patterns.some((pattern) => !pattern.startsWith('!') && path.matchesGlob(file, pattern)) &&
    patterns.every(
      (pattern) => !pattern.startsWith('!') || !path.matchesGlob(file, pattern.slice(1)),
    )
  );
}

async function workspaceProjects() {
  return Promise.all(
    trackedFiles
      .filter((file) => path.basename(file) === 'project.json')
      .map(async (file) => ({
        ...JSON.parse(await read(file)),
        root: path.dirname(file),
      })),
  );
}

test('Nx cache in CI is written to the same directory the cache action saves', async () => {
  const action = await read('.github/actions/setup-nx-affected-job/action.yml');
  assert.match(action, /NX_CACHE_DIRECTORY=\$GITHUB_WORKSPACE\/\.nx\/cache/u);
  assert.match(action, /NX_WORKSPACE_DATA_DIRECTORY=\$GITHUB_WORKSPACE\/\.nx\/workspace-data/u);
  const cacheStep = action.slice(action.indexOf('- name: Cache Nx task results'));
  assert.match(cacheStep, /path: \|\n\s+\.nx\/cache\n\s+\.nx\/workspace-data\/\*\.db\*/u);
  assert.match(action, /NX_DAEMON=false/u);
  assert.match(
    cacheStep,
    /key: nx-\$\{\{ runner\.os \}\}-\$\{\{ github\.job \}\}-\$\{\{ hashFiles\('package\.json', 'pnpm-lock\.yaml'\) \}\}-/u,
  );
  assert.ok(
    action.indexOf('- name: Pin Nx cache directory') <
      action.indexOf('- name: Cache Nx task results'),
    'cache directory must be pinned before restore',
  );
});

test('Lint validates Nx sync independently of Changes', async () => {
  const workflow = (await import('yaml')).default.parse(await read('.github/workflows/ci.yml'));
  assert.equal(workflow.jobs.lint.needs, undefined);
  assert.ok(workflow.jobs.lint.steps.some((step) => step.run?.includes('run-ci-tasks.mjs lint')));
  assert.match(await read('tools/ci-cd-platform/lib/dispatch.mjs'), /'sync:check'/u);
});

test('typecheck hashes the spec files it type-checks and declares no outputs', async () => {
  const nxJson = JSON.parse(await read('nx.json'));
  const typecheck = nxJson.targetDefaults.typecheck;
  assert.deepEqual(typecheck.inputs, ['default', '^production']);
  assert.deepEqual(typecheck.outputs, []);
  const projectFiles = execFileSync('git', ['ls-files', '*project.json'], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
  for (const file of projectFiles) {
    const target = JSON.parse(await read(file)).targets?.typecheck;
    if (target?.inputs) {
      assert.ok(
        !target.inputs.includes('production'),
        `${file} typecheck inputs must not drop spec files`,
      );
    }
  }
});

test('workspace-wide build and test configuration is a shared global input', async () => {
  const nxJson = JSON.parse(await read('nx.json'));
  for (const file of [
    'tsconfig.base.json',
    'tsconfig.workspace-src.json',
    'tsconfig.workspace-dist.json',
    'vitest.shared.ts',
    'vitest.workspace-helpers.ts',
    'vite.workspace-aliases.ts',
  ]) {
    assert.ok(nxJson.namedInputs.sharedGlobals.includes(`{workspaceRoot}/${file}`), file);
  }
});

test('actual shared build imports and target commands participate in task hashes', async () => {
  const nxJson = JSON.parse(await read('nx.json'));
  const projects = await workspaceProjects();
  const tools = trackedFiles.filter((file) => file.startsWith('tools/build/'));
  const used = new Set();
  for (const file of trackedFiles.filter((file) => /\.config\.[cm]?[jt]s$/u.test(file))) {
    const project = projects
      .filter((entry) => entry.root !== '.' && file.startsWith(`${entry.root}/`))
      .sort((a, b) => b.root.length - a.root.length)[0];
    if (!project?.targets?.build) continue;
    for (const imported of ts.preProcessFile(await read(file), true, true).importedFiles) {
      const resolved = path.posix.normalize(path.posix.join(path.dirname(file), imported.fileName));
      const tool = tools.find((entry) => entry === resolved || entry === `${resolved}.ts`);
      if (!tool) continue;
      used.add(tool);
      assert.ok(hashesFile(nxJson, project, 'build', tool), `${file} imports unhashed ${tool}`);
    }
  }
  for (const project of projects) {
    for (const [target, config] of Object.entries(project.targets ?? {})) {
      for (const tool of tools) {
        if (!JSON.stringify(config.options ?? {}).includes(tool)) continue;
        used.add(tool);
        assert.ok(
          hashesFile(nxJson, project, target, tool),
          `${project.name}:${target} executes unhashed ${tool}`,
        );
      }
    }
  }
  assert.deepEqual(
    [...used].sort(),
    tools.sort(),
    'every tools/build file has an audited consumer',
  );
});

test('CI contract tests hash the external files they inspect', async () => {
  const nxJson = JSON.parse(await read('nx.json'));
  const project = (await workspaceProjects()).find((entry) => entry.name === 'ci-cd-platform');
  for (const file of [
    '.github/workflows/ci.yml',
    '.github/actions/setup-nx-affected-job/action.yml',
    'nx.json',
    'project.json',
    'packages/database/project.json',
    'apps/api/project.json',
    'packages/contracts/tsup.config.ts',
    'tools/build/normalize-generated-prisma.mjs',
    'apps/desktop/desktop-update-rollout.mjs',
    'apps/desktop/e2e/packaged-runtime/isolated-native-env.ts',
    'apps/desktop/scripts/run-windows-update-e2e.ps1',
    'apps/desktop/electron-builder.json5',
    'deployment/production/docker-compose.production.yml',
    'deployment/staging/staging-deploy-watch.sh',
    'docker/powersync/Dockerfile.bake',
    'docker-compose.yml',
    '.dockerignore',
    'release-please-config.json',
  ]) {
    for (const target of ['test', 'governance', 'contract']) {
      assert.ok(hashesFile(nxJson, project, target, file), `${target} does not hash ${file}`);
    }
  }
});

test('restored Nx artifacts require the matching SQLite index to produce a cache hit in a fresh process', async () => {
  const { mkdtempSync, mkdirSync, readdirSync, cpSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const root = mkdtempSync(path.join(tmpdir(), 'memoflow-nx-cache-'));
  const nativePath = require.resolve('nx/src/native');
  const program = `
    const fs = require('node:fs');
    const path = require('node:path');
    const { NxCache, TaskDetails, connectToNxDb, closeDbConnection } = require(${JSON.stringify(nativePath)});
    const [workspace, artifacts, metadata, mode] = process.argv.slice(1);
    fs.mkdirSync(workspace, { recursive: true });
    const db = connectToNxDb(metadata, 'unit-cache');
    const cache = new NxCache(workspace, artifacts, db);
    if (mode === 'put') {
      new TaskDetails(db).recordTaskDetails([{ hash: '1234567890123456789', project: 'unit-cache', target: 'test' }]);
      fs.mkdirSync(path.join(workspace, 'out'), { recursive: true });
      fs.writeFileSync(path.join(workspace, 'out/result.txt'), 'verified artifact');
      cache.put('1234567890123456789', 'cached Unit output', ['out'], 0);
    } else {
      const result = cache.get('1234567890123456789');
      if (result) cache.copyFilesFromCache(result, ['out']);
      process.stdout.write(JSON.stringify({ hit: Boolean(result), code: result?.code,
        output: result?.terminalOutput,
        artifact: result ? fs.readFileSync(path.join(workspace, 'out/result.txt'), 'utf8') : null }));
    }
    closeDbConnection(db);
  `;
  const run = (name, mode) =>
    execFileSync(
      process.execPath,
      [
        '-e',
        program,
        path.join(root, name, 'workspace'),
        path.join(root, name, 'cache'),
        path.join(root, name, 'data'),
        mode,
      ],
      { encoding: 'utf8', timeout: 10_000 },
    );
  try {
    run('source', 'put');
    mkdirSync(path.join(root, 'restored'), { recursive: true });
    cpSync(path.join(root, 'source/cache'), path.join(root, 'restored/cache'), { recursive: true });
    assert.equal(JSON.parse(run('restored', 'get')).hit, false, 'artifact-only cache cannot hit');
    rmSync(path.join(root, 'restored/data'), { recursive: true, force: true });
    mkdirSync(path.join(root, 'restored/data'));
    const files = readdirSync(path.join(root, 'source/data')).filter((name) =>
      name.includes('.db'),
    );
    assert.ok(files.length > 0);
    for (const name of files)
      cpSync(path.join(root, 'source/data', name), path.join(root, 'restored/data', name));
    assert.deepEqual(JSON.parse(run('restored', 'get')), {
      hit: true,
      code: 0,
      output: 'cached Unit output',
      artifact: 'verified artifact',
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('mixed Build + Typecheck selects exact initiating tasks with one shared dependency graph', async () => {
  const { selectBuildTasks } = await import('../lib/nx-build-tasks.mjs');
  const { createProjectGraphAsync } = require('nx/src/project-graph/project-graph');
  const graph = await createProjectGraphAsync({ exitOnError: true });
  const selection = selectBuildTasks(graph, [
    'api:build',
    'app-vue:typecheck',
    'database:typecheck',
  ]);
  assert.deepEqual(selection.initiatingTaskIds, [
    'api:build',
    'app-vue:typecheck',
    'database:typecheck',
  ]);
  assert.ok(selection.taskGraph.tasks['database:prisma-generate']);
  assert.ok(
    selection.taskGraph.dependencies['database:typecheck'].includes('database:prisma-generate'),
  );
  assert.ok(selection.taskGraph.tasks['contracts:build']);
  assert.equal(
    selection.taskGraph.tasks['api:typecheck'],
    undefined,
    'no project/target cross product',
  );
  assert.equal(selection.taskGraph.tasks['app-vue:build'], undefined, 'no extra production build');
  assert.equal(selection.taskIds.filter((id) => id === 'database:prisma-generate').length, 1);
  assert.throws(() => selectBuildTasks(graph, []));
  assert.throws(() => selectBuildTasks(graph, ['api:test']));
});

test('real Nx merged scheduler runs both targets concurrently, deduplicates dependencies and exposes failures', async () => {
  const { mkdtemp, mkdir, writeFile, symlink, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { spawnSync } = await import('node:child_process');
  const root = await mkdtemp(path.join(tmpdir(), 'nx-build-graph-'));
  try {
    await symlink(path.resolve('node_modules'), path.join(root, 'node_modules'), 'dir');
    await writeFile(
      path.join(root, 'nx.json'),
      JSON.stringify({
        parallel: 3,
        targetDefaults: { build: { dependsOn: ['^build'] }, typecheck: { dependsOn: ['^build'] } },
      }),
    );
    await writeFile(
      path.join(root, 'package.json'),
      JSON.stringify({ name: 'graph-fixture', private: true }),
    );
    await writeFile(
      path.join(root, 'step.cjs'),
      `const fs=require('fs');const name=process.argv[2];fs.appendFileSync('executed.jsonl',JSON.stringify({name,start:Date.now()})+'\\n');setTimeout(()=>{fs.appendFileSync('executed.jsonl',JSON.stringify({name,end:Date.now()})+'\\n');process.exit(name==='b-typecheck'&&process.env.FAIL_TYPES==='1'?1:0)},150);`,
    );
    for (const name of ['a', 'b', 'shared']) {
      await mkdir(path.join(root, name));
      await writeFile(
        path.join(root, name, 'project.json'),
        JSON.stringify({
          name,
          ...(name !== 'shared' ? { implicitDependencies: ['shared'] } : {}),
          targets: Object.fromEntries(
            ['build', 'typecheck'].map((target) => [
              target,
              {
                executor: 'nx:run-commands',
                options: { command: `node step.cjs ${name}-${target}` },
              },
            ]),
          ),
        }),
      );
    }
    const execute = (env = {}) =>
      spawnSync(
        process.execPath,
        [path.resolve('tools/ci-cd-platform/run-nx-build-tasks.mjs'), 'a:build', 'b:typecheck'],
        {
          cwd: root,
          encoding: 'utf8',
          env: {
            ...process.env,
            NX_DAEMON: 'false',
            NX_WORKSPACE_ROOT_PATH: root,
            CI: 'true',
            ...env,
          },
        },
      );
    const success = execute();
    assert.equal(success.status, 0, success.stdout + success.stderr);
    const lines = (await readFile(path.join(root, 'executed.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .map(JSON.parse);
    assert.deepEqual(
      lines
        .filter((r) => r.start)
        .map((r) => r.name)
        .sort(),
      ['a-build', 'b-typecheck', 'shared-build'],
    );
    assert.ok(
      lines.find((r) => r.name === 'b-typecheck' && r.start).start <
        lines.find((r) => r.name === 'a-build' && r.end).end,
      'independent targets overlap',
    );
    const failure = execute({ FAIL_TYPES: '1' });
    assert.equal(failure.status, 1, failure.stdout + failure.stderr);
    const { readdir } = await import('node:fs/promises');
    const result = JSON.parse(
      await readFile(
        path.join(
          root,
          'reports/ci-tasks',
          (await readdir(path.join(root, 'reports/ci-tasks')))[0],
        ),
        'utf8',
      ),
    );
    assert.equal(result.tasks['a:build'].status, 'success');
    assert.equal(result.tasks['b:typecheck'].status, 'failure');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
