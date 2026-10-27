import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const useCaseCoverageConfigs = ['task', 'goal'].flatMap((project) => [
  `packages/${project}/vitest.config.ts`,
  `packages/${project}/vitest.use-cases.config.ts`,
  `packages/${project}/vitest.mappers.config.ts`,
]);

// R4-2201C: @memoflow/routine now owns Routine vNext only; the old CRUD
// use-case/mapper slices were deleted with their production code.
useCaseCoverageConfigs.push('packages/routine/vitest.config.ts');

const coverageConfigs = [
  ...useCaseCoverageConfigs,
  // S4-2302B retired Scheduler's legacy ScheduleTask use-case slice.
  'packages/scheduler/vitest.config.ts',
  'packages/scheduler/vitest.mappers.config.ts',
  'packages/schedule/vitest.config.ts',
  'packages/schedule/vitest.mappers.config.ts',
];

test('aggregate coverage configs emit distinct JSON and JUnit reports', () => {
  const script = `
    const configs = JSON.parse(process.env.VITEST_REPORT_CONFIGS);
    const reports = configs.map((file) => require('./' + file).default.test.outputFile);
    process.stdout.write(JSON.stringify(reports));
  `;
  const result = spawnSync(process.execPath, ['--import', 'tsx', '-e', script], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      CI: 'true',
      TEST_REPORT_NAME: 'coverage',
      VITEST_REPORT_CONFIGS: JSON.stringify(coverageConfigs),
    },
  });

  assert.equal(result.status, 0, result.stderr);
  const reports = JSON.parse(result.stdout);
  assert.equal(reports.length, coverageConfigs.length);
  assert.equal(new Set(reports.map((report) => report.json)).size, coverageConfigs.length);
  assert.equal(new Set(reports.map((report) => report.junit)).size, coverageConfigs.length);
});

// Real child processes protect the adapter's exit-code and Chromium cleanup contract.
test('Storybook process adapter preserves failures and spawn errors', async () => {
  // eslint-disable-next-line @nx/enforce-module-boundaries -- Exercise the repository test execution adapter.
  const { startStorybookProcess } = await import('../../test/storybook-process.mjs');
  assert.equal(await startStorybookProcess(process.execPath, ['-e', 'process.exit(7)']).done, 7);
  await assert.rejects(startStorybookProcess('/nonexistent/memoflow-storybook', []).done, {
    code: 'ENOENT',
  });
});

test(
  'Storybook cancellation terminates the browser process group',
  {
    skip: process.platform !== 'linux',
  },
  async () => {
    const { mkdtempSync, readFileSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const directory = mkdtempSync(join(tmpdir(), 'storybook-lifecycle-'));
    const pidFile = join(directory, 'browser.pid');
    const browser = `process.on('SIGTERM', () => {}); require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); setInterval(() => {}, 1000);`;
    const owner = `require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(browser)}], {stdio:'ignore'}); setInterval(() => {}, 1000);`;
    const helper = new URL('../../test/storybook-process.mjs', import.meta.url).href;
    const script = `
    import { existsSync } from 'node:fs';
    import { startStorybookProcess } from ${JSON.stringify(helper)};
    const run = startStorybookProcess(process.execPath, ['-e', ${JSON.stringify(owner)}]);
    const deadline = Date.now() + 5000;
    while (!existsSync(${JSON.stringify(pidFile)})) {
      if (Date.now() > deadline) throw new Error('browser did not start');
      await new Promise(r => setTimeout(r, 10));
    }
    process.kill(process.pid, 'SIGTERM');
    process.exitCode = await run.done;
  `;
    try {
      const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
        encoding: 'utf8',
        timeout: 10000,
      });
      assert.equal(result.status, 143, result.stderr);
      const pid = readFileSync(pidFile, 'utf8');
      // A reparented zombie awaits PID 1; it cannot hold a browser port or run code.
      let running = false;
      try {
        running = readFileSync(`/proc/${pid}/stat`, 'utf8').split(' ')[2] !== 'Z';
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      assert.equal(running, false, 'Chromium descendant survived cancellation');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);

test('Storybook UI watch receives source changes outside the addon root', () => {
  const configUrl = new URL('../../../apps/storybook/vitest.config.ts', import.meta.url).href;
  const script = `
    import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
    import path from 'node:path';
    import { createServer } from 'vite';
    const { default: config } = await import(${JSON.stringify(configUrl)});
    const workspace = process.cwd();
    const directory = mkdtempSync(path.join(workspace, 'packages', '.tmp-storybook-watch-'));
    const file = path.join(directory, 'probe.txt');
    writeFileSync(file, 'before');
    let server;
    try {
      server = await createServer({
        configFile: false, root: path.join(workspace, 'apps/storybook'),
        plugins: config.plugins, server: { middlewareMode: true },
        optimizeDeps: { noDiscovery: true, include: [] },
      });
      const deadline = Date.now() + 8000;
      while (!server.watcher.getWatched()[directory]?.includes('probe.txt')) {
        if (Date.now() > deadline) throw new Error('External Storybook sources are not watched');
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      await new Promise(resolve => setTimeout(resolve, 100));
      const changed = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Source change was lost')), 3000);
        server.watcher.on('change', name => { if (name === file) { clearTimeout(timer); resolve(); } });
      });
      writeFileSync(file, 'after');
      await changed;
    } finally {
      await server?.close();
      rmSync(directory, {recursive: true, force: true});
    }
  `;
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', '--input-type=module', '-e', script],
    {
      encoding: 'utf8',
      timeout: 20000,
    },
  );
  assert.equal(result.status, 0, result.stderr);
});
