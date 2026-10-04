import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import fg from 'fast-glob';
import {
  analyzeE2EOwnership,
  analyzeE2ERetirement,
  decorateE2EOwnership,
  loadE2EOwnership,
  loadE2ERetirement,
} from './e2e-governance.mjs';

const execFileAsync = promisify(execFile);

export const INVENTORY_VERSION = 3;
export const PRIMARY_SUITES = Object.freeze([
  'unit',
  'integration',
  'smoke',
  'boundary-ipc',
  'boundary-main',
  'e2e',
  'perf',
  'governance',
]);

const TEST_FILE = /\.(?:test|spec|bench)\.[cm]?[jt]sx?$/;
const PROJECT_FILES = [
  'project.json',
  'apps/**/project.json',
  'packages/**/project.json',
  'tools/**/project.json',
];

function normalizePath(value) {
  return value.replaceAll(path.sep, '/');
}

export function classifyTest(relativePath) {
  const normalized = normalizePath(relativePath);
  const basename = path.basename(normalized);
  if (!TEST_FILE.test(basename)) return null;
  if (/(^|\.)integration\.(?:test|spec)\./.test(basename)) return 'integration';
  if (/(^|\.)smoke\.(?:test|spec)\./.test(basename)) return 'smoke';
  if (/(^|\.)bench\./.test(basename)) return 'perf';
  if (normalized.startsWith('tools/')) return 'governance';
  if (normalized.includes('/e2e/') || normalized.startsWith('apps/web/e2e/')) return 'e2e';
  if (normalized.startsWith('apps/desktop/src/main/')) {
    if (
      normalized.includes('/ipc/') ||
      /(?:^|[-.])ipc(?:[-.])/.test(basename)
    ) {
      return 'boundary-ipc';
    }
    if (
      normalized.includes('/database/') ||
      normalized.includes('/bootstrap') ||
      normalized.includes('/lifecycle/') ||
      /(?:^|\.)main\.(?:test|spec)\./.test(basename)
    ) {
      return 'boundary-main';
    }
  }
  return 'unit';
}

export async function collectTestFiles(root) {
  const files = await fg(
    [
      'apps/**/*.{test,spec,bench}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
      'packages/**/*.{test,spec,bench}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
      'tools/**/*.{test,spec,bench}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
    ],
    {
      cwd: root,
      dot: false,
      ignore: [
        '**/node_modules/**',
        '**/.venv/**',
        '**/dist/**',
        '**/coverage/**',
      ],
    },
  );
  return files.map(normalizePath).sort();
}

function commandsForTarget(target) {
  const options = target?.options ?? {};
  if (typeof options.command === 'string') return [options.command];
  if (!Array.isArray(options.commands)) return [];
  return options.commands
    .map((command) => (typeof command === 'string' ? command : command?.command))
    .filter((command) => typeof command === 'string');
}

function configArgument(command) {
  return command.match(/(?:^|\s)--config(?:=|\s+)([^\s"']+)/u)?.[1] ?? null;
}

function resolveConfig(root, cwd, config) {
  if (!config) return path.resolve(cwd, 'vitest.config.ts');
  if (/^(?:apps|packages|tools)\//u.test(config)) return path.resolve(root, config);
  return path.resolve(cwd, config);
}

function suiteForTarget(projectName, targetName) {
  if (targetName === 'test') {
    return ['governance-tools', 'test-system-v2', 'ci-cd-platform'].includes(projectName)
      ? 'governance'
      : 'unit';
  }
  if (targetName === 'test:integration') return 'integration';
  if (targetName === 'test:smoke') return 'smoke';
  if (targetName === 'test:ipc') return 'boundary-ipc';
  if (targetName === 'test:main') return 'boundary-main';
  if (targetName === 'test:perf' || targetName === 'test:perf:experiment') return 'perf';
  if (targetName === 'test:governance') return 'governance';
  return null;
}

function normalizeCollectedFile(root, cwd, value) {
  const withoutAnsi = value.replace(/\u001b\[[0-9;]*m/gu, '').trim();
  const absolute = path.isAbsolute(withoutAnsi)
    ? withoutAnsi
    : /^(?:apps|packages|tools)\//u.test(withoutAnsi)
      ? path.resolve(root, withoutAnsi)
      : path.resolve(cwd, withoutAnsi);
  return normalizePath(path.relative(root, absolute));
}

async function normalizeListedFiles(root, cwd, values) {
  const candidates = await fg(
    '**/*.{test,spec,bench}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
    {
      cwd,
      ignore: ['**/node_modules/**', '**/.venv/**', '**/dist/**', '**/coverage/**'],
    },
  );
  return values.map((value) => {
    const normalized = normalizePath(value.replace(/\u001b\[[0-9;]*m/gu, '').trim());
    if (path.isAbsolute(normalized) || /^(?:apps|packages|tools)\//u.test(normalized)) {
      return normalizeCollectedFile(root, cwd, normalized);
    }
    const exact = candidates.find((candidate) => normalizePath(candidate) === normalized);
    const suffixMatches = candidates.filter((candidate) =>
      normalizePath(candidate).endsWith(`/${normalized}`),
    );
    if (exact) return normalizeCollectedFile(root, cwd, exact);
    if (suffixMatches.length === 1) {
      return normalizeCollectedFile(root, cwd, suffixMatches[0]);
    }
    return normalizeCollectedFile(root, cwd, normalized);
  });
}

async function listVitestFiles(root, configPath) {
  const cwd = path.dirname(configPath);
  const vitestCli = path.resolve(root, 'node_modules/vitest/vitest.mjs');
  const { stdout } = await execFileAsync(
    process.execPath,
    [vitestCli, 'list', '--filesOnly', '--config', path.basename(configPath), '--no-color'],
    {
      cwd,
      env: {
        ...process.env,
        CI: '1',
        FORCE_COLOR: '0',
        TEST_INVENTORY_LIST: '1',
      },
      maxBuffer: 20 * 1024 * 1024,
      timeout: 30_000,
    },
  );
  const listed = stdout
    .split(/\r?\n/u)
    .map((line) => line.match(/^(?:\[[^\]]+\]\s+)?(.+\.(?:test|spec|bench)\.[cm]?[jt]sx?)$/u)?.[1])
    .filter(Boolean)
  return (await normalizeListedFiles(root, cwd, listed)).sort();
}

async function listPlaywrightFiles(root, configPath) {
  const cwd = path.dirname(configPath);
  const playwrightCli = path.resolve(root, 'node_modules/@playwright/test/cli.js');
  const { stdout } = await execFileAsync(
    process.execPath,
    [
      playwrightCli,
      'test',
      '--list',
      '--reporter=list',
      '--config',
      path.basename(configPath),
    ],
    {
      cwd,
      env: {
        ...process.env,
        CI: '1',
        FORCE_COLOR: '0',
        TEST_INVENTORY_LIST: '1',
        E2E_WEB_BASE_URL: process.env.E2E_WEB_BASE_URL ?? 'http://127.0.0.1:4173',
        E2E_API_BASE_URL: process.env.E2E_API_BASE_URL ?? 'http://127.0.0.1:3000',
      },
      maxBuffer: 30 * 1024 * 1024,
      timeout: 30_000,
    },
  );
  const files = new Set();
  for (const line of stdout.split(/\r?\n/u)) {
    const withoutProject = line.trim().replace(/^\[[^\]]+\]\s+›\s+/u, '');
    const match = withoutProject.match(
      /^([^:\n]+?\.(?:test|spec)\.[cm]?[jt]sx?):\d+:/u,
    );
    if (match) files.add(match[1]);
  }
  return (await normalizeListedFiles(root, cwd, [...files])).sort();
}

async function mapWithConcurrency(values, limit, mapper) {
  const results = new Array(values.length);
  let next = 0;
  async function worker() {
    while (next < values.length) {
      const index = next;
      next += 1;
      results[index] = await mapper(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, () => worker()));
  return results;
}

function nodeTestPatterns(command) {
  return [...command.matchAll(/((?:apps|packages|tools)\/[^^\s"';&]*\.(?:test|spec|bench)\.[^\s"';&]+)/gu)]
    .map((match) => match[1]);
}

export async function collectConfiguredTests(root) {
  const projectFiles = await fg(PROJECT_FILES, {
    cwd: root,
    ignore: ['**/node_modules/**', '**/.venv/**'],
  });
  const definitions = [];
  for (const projectFile of projectFiles.sort()) {
    const project = JSON.parse(await fs.readFile(path.resolve(root, projectFile), 'utf8'));
    for (const [targetName, target] of Object.entries(project.targets ?? {})) {
      const suite = suiteForTarget(project.name ?? projectFile, targetName);
      const measurement = targetName === 'test:coverage' ? 'coverage' : null;
      if (!suite && !measurement) continue;
      const cwd = path.resolve(root, target.options?.cwd ?? '.');
      for (const command of commandsForTarget(target)) {
        if (/\bvitest(?:\.mjs)?\b/u.test(command)) {
          const configPath = resolveConfig(root, cwd, configArgument(command));
          definitions.push({
            id: normalizePath(path.relative(root, configPath)),
            type: measurement ? 'measurement' : 'primary',
            suite: measurement ?? suite,
            runner: 'vitest',
            configPath,
          });
        }
        if (suite && /\bnode\s+--test\b/u.test(command)) {
          const patterns = nodeTestPatterns(command);
          definitions.push({
            id: `${project.name}:${targetName}`,
            type: 'primary',
            suite,
            runner: 'node-test',
            files: await fg(patterns, { cwd: root }),
          });
        }
      }
    }
  }

  for (const config of await fg('apps/**/playwright*.config.{js,mjs,ts,mts}', {
    cwd: root,
    ignore: ['**/node_modules/**'],
  })) {
    definitions.push({
      id: normalizePath(config),
      type: 'primary',
      suite: 'e2e',
      runner: 'playwright',
      configPath: path.resolve(root, config),
    });
  }

  const uniqueRuns = new Map();
  for (const definition of definitions) {
    if (!definition.configPath) continue;
    const key = `${definition.runner}:${definition.configPath}`;
    if (!uniqueRuns.has(key)) uniqueRuns.set(key, definition);
  }
  const collectedRuns = await mapWithConcurrency([...uniqueRuns.entries()], 4, async ([key, definition]) => {
    const files = definition.runner === 'vitest'
      ? await listVitestFiles(root, definition.configPath)
      : await listPlaywrightFiles(root, definition.configPath);
    return [key, files];
  });
  const filesByRun = new Map(collectedRuns);

  return definitions.map(({ configPath, ...definition }) => ({
    ...definition,
    files: (definition.files ?? filesByRun.get(`${definition.runner}:${configPath}`) ?? [])
      .map(normalizePath)
      .sort(),
  }));
}

export function analyzeInventory(files, collectors) {
  const normalizedFiles = [...new Set(files.map(normalizePath))].sort();
  const normalizedCollectors = [...collectors].sort((left, right) =>
    `${left.type}:${left.suite}:${left.runner}:${left.id}`.localeCompare(
      `${right.type}:${right.suite}:${right.runner}:${right.id}`,
    ),
  );
  const fileSet = new Set(normalizedFiles);
  const ownership = new Map(normalizedFiles.map((file) => [file, { primary: [], measurement: [] }]));
  const unexpected = [];

  for (const collector of normalizedCollectors) {
    if (collector.type !== 'primary' && collector.type !== 'measurement') {
      unexpected.push({ collector: collector.id, reason: 'invalid-collector-type' });
      continue;
    }
    if (collector.type === 'primary' && !PRIMARY_SUITES.includes(collector.suite)) {
      unexpected.push({ collector: collector.id, reason: 'invalid-primary-suite', suite: collector.suite });
      continue;
    }
    for (const file of collector.files) {
      const normalized = normalizePath(file);
      if (!fileSet.has(normalized)) {
        unexpected.push({ collector: collector.id, path: normalized, reason: 'non-inventory-file' });
        continue;
      }
      ownership.get(normalized)[collector.type].push(collector);
    }
  }

  const primary = [];
  const missing = [];
  const duplicate = [];
  const measurementOnly = [];
  for (const file of normalizedFiles) {
    const value = ownership.get(file);
    const suites = [...new Set(value.primary.map((collector) => collector.suite))].sort();
    const expectedSuite = classifyTest(file);
    if (suites.length === 0) missing.push(file);
    if (suites.length > 1) {
      duplicate.push({
        path: file,
        suites,
        collectors: value.primary.map((collector) => collector.id).sort(),
      });
    }
    if (suites.length === 1 && expectedSuite !== suites[0]) {
      unexpected.push({
        path: file,
        reason: 'suite-mismatch',
        expectedSuite,
        collectedSuite: suites[0],
      });
    }
    if (suites.length === 0 && value.measurement.length > 0) {
      measurementOnly.push({
        path: file,
        collectors: value.measurement.map((collector) => collector.id).sort(),
      });
    }
    primary.push({
      path: file,
      primarySuite: suites.length === 1 ? suites[0] : null,
      collectors: value.primary.map((collector) => collector.id).sort(),
      measurementCollectors: value.measurement.map((collector) => collector.id).sort(),
    });
  }

  const measurementSuites = {};
  for (const collector of normalizedCollectors.filter((item) => item.type === 'measurement')) {
    const filesForSuite = measurementSuites[collector.suite] ?? new Set();
    for (const file of collector.files) {
      if (fileSet.has(file)) filesForSuite.add(file);
    }
    measurementSuites[collector.suite] = filesForSuite;
  }

  return {
    version: INVENTORY_VERSION,
    primary,
    collectors: normalizedCollectors.map(({ files: collectorFiles, ...collector }) => ({
      ...collector,
      fileCount: collectorFiles.length,
    })),
    measurementSuites: Object.fromEntries(
      Object.entries(measurementSuites).map(([suite, suiteFiles]) => [suite, [...suiteFiles].sort()]),
    ),
    measurementOnly,
    missing,
    duplicate,
    unexpected: unexpected.sort((left, right) =>
      `${left.path ?? ''}:${left.collector ?? ''}`.localeCompare(`${right.path ?? ''}:${right.collector ?? ''}`),
    ),
    counts: Object.fromEntries(
      PRIMARY_SUITES.map((suite) => [
        suite,
        primary.filter((entry) => entry.primarySuite === suite).length,
      ]),
    ),
  };
}

export async function buildInventory(root, options = {}) {
  const files = options.files ?? await collectTestFiles(root);
  const collectors = options.collectors ?? await collectConfiguredTests(root);
  const baseInventory = analyzeInventory(files, collectors);
  const contract = options.e2eOwnership ?? await loadE2EOwnership(root);
  const retirement = options.e2eRetirement ?? await loadE2ERetirement(root);
  const inventory = decorateE2EOwnership(baseInventory, contract);
  return {
    ...inventory,
    e2eGovernance: await analyzeE2EOwnership(root, inventory, contract),
    e2eRetirement: await analyzeE2ERetirement(root, retirement),
  };
}

export async function writeInventory(root, output = 'tools/test-system-v2/test-inventory.json') {
  const inventory = await buildInventory(root);
  const target = path.resolve(root, output);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(inventory, null, 2)}\n`);
  return inventory;
}
