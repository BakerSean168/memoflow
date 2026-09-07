import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const rawArgs = process.argv.slice(2);
const shouldWrite = rawArgs.includes('--write');
const projectFilter = getArgValue('--project');
const mode = shouldWrite ? 'write' : 'check';

const governedDomainProjects = new Set([
  'account',
  'ai',
  'authentication',
  'domain-shared',
  'goal',
  'governance',
  'notification',
  'reminder',
  'schedule',
  'scheduler',
  'setting',
  'task',
]);

const boundaryRequiredTargets = new Map([
  ['api', ['test', 'test:watch', 'test:smoke']],
  ['task', ['test', 'test:watch', 'test:integration', 'test:perf']],
  ['desktop', ['test', 'test:watch', 'test:ipc', 'test:main']],
  ['web', ['test', 'test:watch', 'e2e', 'e2e:sync']],
]);

const governedRequiredTargets = ['test', 'test:watch', 'test:coverage'];
const coverageConfigsByProject = new Map([
  ['goal', ['vitest.config.ts', 'vitest.use-cases.config.ts', 'vitest.mappers.config.ts']],
  ['reminder', ['vitest.config.ts', 'vitest.use-cases.config.ts', 'vitest.mappers.config.ts']],
  ['schedule', ['vitest.config.ts', 'vitest.use-cases.config.ts', 'vitest.mappers.config.ts']],
  ['scheduler', ['vitest.config.ts', 'vitest.use-cases.config.ts', 'vitest.mappers.config.ts']],
  ['task', ['vitest.config.ts', 'vitest.use-cases.config.ts', 'vitest.mappers.config.ts']],
]);

// P2：contracts/patterns 的 unit test 包含 operations dist surface 门禁，
// 因此 `test` target 必须在自身 `build` 之后运行（clean checkout 自洽）。
const buildFirstVitestProjects = new Set(['contracts', 'patterns']);

function createVitestCommand(cwd, args) {
  const executable = cwd
    ? `${relativeWorkspaceRoot(cwd)}/node_modules/vitest/vitest.mjs`
    : './node_modules/vitest/vitest.mjs';

  return `node ${executable} ${args}`;
}

function relativeWorkspaceRoot(projectRoot) {
  return (
    projectRoot
      .split(/[\\/]/)
      .filter(Boolean)
      .map(() => '..')
      .join('/') || '.'
  );
}

const projectFiles = await findProjectJsonFiles(ROOT);
const errors = [];
const changes = [];
let matchedProjectCount = 0;

for (const projectFile of projectFiles) {
  const raw = await readFile(projectFile, 'utf8');
  const json = JSON.parse(raw);
  if (!matchesProjectFilter(projectFile, json.name, projectFilter)) {
    continue;
  }

  matchedProjectCount += 1;
  const targets = json.targets ?? {};
  const projectRoot = toRelative(path.dirname(projectFile));
  const hasLocalVitestConfig = await fileExists(
    path.join(path.dirname(projectFile), 'vitest.config.ts'),
  );
  const isBoundaryProject = boundaryRequiredTargets.has(json.name);
  const isGovernedDomainProject = governedDomainProjects.has(json.name);
  let changed = false;

  if (targets['test:performance']) {
    if (!targets['test:perf']) {
      targets['test:perf'] = targets['test:performance'];
      changed = true;
    }
    delete targets['test:performance'];
    changed = true;
  }

  const targetTemplates = getBoundaryTargetTemplates(json.name);
  if (targetTemplates) {
    for (const [targetName, targetTemplate] of Object.entries(targetTemplates)) {
      if (!areTargetsEqual(targets[targetName], targetTemplate)) {
        if (shouldWrite) {
          targets[targetName] = structuredClone(targetTemplate);
          changed = true;
        } else {
          errors.push(
            `${json.name}: target "${targetName}" drifted from the generator template in ${toRelative(projectFile)}`,
          );
        }
      }
    }
  }

  const shouldNormalizeLocalVitestTargets =
    hasLocalVitestConfig &&
    !isBoundaryProject &&
    (isGovernedDomainProject ||
      usesVitest(targets.test) ||
      usesVitest(targets['test:watch']) ||
      usesVitest(targets['test:coverage']));

  if (shouldNormalizeLocalVitestTargets) {
    const localVitestTargets = getLocalVitestTargetTemplates(
      projectRoot,
      isGovernedDomainProject,
      json.name,
    );
    for (const [targetName, targetTemplate] of Object.entries(localVitestTargets)) {
      if (!areTargetsEqual(targets[targetName], targetTemplate)) {
        if (shouldWrite) {
          targets[targetName] = structuredClone(targetTemplate);
          changed = true;
        } else {
          errors.push(
            `${json.name}: target "${targetName}" drifted from the generator template in ${toRelative(projectFile)}`,
          );
        }
      }
    }
  } else if (isGovernedDomainProject && hasLocalVitestConfig) {
    const coverageTarget = getLocalVitestTargetTemplates(projectRoot, true, json.name)[
      'test:coverage'
    ];
    if (!areTargetsEqual(targets['test:coverage'], coverageTarget)) {
      if (shouldWrite) {
        targets['test:coverage'] = structuredClone(coverageTarget);
        changed = true;
      } else {
        errors.push(
          `${json.name}: target "test:coverage" drifted from the generator template in ${toRelative(projectFile)}`,
        );
      }
    }
  }

  for (const deprecatedTarget of [
    'test:performance',
    'test:coverage:use-cases',
    'test:coverage:prisma-mappers',
  ]) {
    if (targets[deprecatedTarget]) {
      errors.push(
        `${json.name}: deprecated target "${deprecatedTarget}" must be folded into the standard vocabulary in ${toRelative(projectFile)}`,
      );
    }
  }

  for (const [projectName, requiredTargets] of boundaryRequiredTargets.entries()) {
    if (json.name !== projectName) continue;
    for (const targetName of requiredTargets) {
      if (!targets[targetName]) {
        errors.push(
          `${json.name}: missing required target "${targetName}" in ${toRelative(projectFile)}`,
        );
      }
    }
  }

  if (isGovernedDomainProject) {
    for (const targetName of governedRequiredTargets) {
      if (!targets[targetName]) {
        errors.push(
          `${json.name}: missing required target "${targetName}" in ${toRelative(projectFile)}`,
        );
      }
    }
  }

  if (targets.test && usesVitest(targets.test) && !targets['test:watch']) {
    errors.push(
      `${json.name}: vitest test target requires "test:watch" in ${toRelative(projectFile)}`,
    );
  }

  if (isGovernedDomainProject) {
    await checkDomainStructure(json.name, path.dirname(projectFile), errors);
  }

  if (changed) {
    json.targets = targets;
    changes.push(toRelative(projectFile));
    if (shouldWrite) {
      await writeFile(projectFile, `${JSON.stringify(json, null, 2)}\n`, 'utf8');
    }
  }
}

if (projectFilter && matchedProjectCount === 0) {
  console.error(
    `[test-target-governance] ${mode} failed: no project matched filter "${projectFilter}".`,
  );
  process.exit(1);
}

if (shouldWrite) {
  if (changes.length > 0) {
    console.log(`[test-target-governance] Updated ${changes.length} project.json files:`);
    for (const file of changes) {
      console.log(`  - ${file}`);
    }
  } else {
    console.log('[test-target-governance] No updates were needed.');
  }
}

if (errors.length > 0) {
  console.error(`[test-target-governance] ${mode} failed with ${errors.length} issue(s):`);
  for (const error of errors) {
    console.error(`  - ${error}`);
  }
  process.exit(1);
}

console.log(`[test-target-governance] ${mode} passed.`);

function deriveWatchTarget(testTarget) {
  if (!testTarget || testTarget.executor !== 'nx:run-commands' || !usesVitest(testTarget)) {
    return null;
  }

  const options = testTarget.options ?? {};
  const testCommand = pickCommand(options);
  if (!testCommand || !testCommand.includes('vitest')) {
    return null;
  }

  const watchCommand = testCommand
    .replace(/\bvitest\s+run\b/, 'vitest')
    .replace(/vitest\.mjs\s+run\b/, 'vitest.mjs');
  if (watchCommand === testCommand) {
    return null;
  }

  const watchOptions = { command: watchCommand };
  if (options.cwd) {
    watchOptions.cwd = options.cwd;
  }

  return {
    executor: 'nx:run-commands',
    cache: false,
    options: watchOptions,
  };
}

function getLocalVitestTargetTemplates(projectRoot, includeCoverage = false, projectName = '') {
  const templates = {
    test: {
      executor: 'nx:run-commands',
      outputs: ['{workspaceRoot}/coverage/{projectRoot}'],
      inputs: ['default', '^production'],
      ...(buildFirstVitestProjects.has(projectName) ? { dependsOn: ['build'] } : {}),
      cache: true,
      options: {
        command: createVitestCommand(projectRoot, 'run --config vitest.config.ts'),
        cwd: projectRoot,
      },
    },
    'test:watch': {
      executor: 'nx:run-commands',
      cache: false,
      options: {
        command: createVitestCommand(projectRoot, '--config vitest.config.ts'),
        cwd: projectRoot,
      },
    },
  };

  if (includeCoverage) {
    const coverageConfigs = coverageConfigsByProject.get(projectName) ?? ['vitest.config.ts'];
    const commands = coverageConfigs.map((configFile) => ({
      command: createVitestCommand(projectRoot, `run --config ${configFile} --coverage`),
      forwardAllArgs: false,
    }));
    templates['test:coverage'] = {
      executor: 'nx:run-commands',
      outputs: ['{workspaceRoot}/coverage/{projectRoot}'],
      inputs: ['default', '^production'],
      cache: true,
      options: {
        ...(commands.length === 1
          ? { command: commands[0].command }
          : { commands, parallel: false }),
        cwd: projectRoot,
      },
    };
  }

  return templates;
}

function getBoundaryTargetTemplates(projectName) {
  const templates = {
    api: {
      test: {
        executor: 'nx:run-commands',
        outputs: ['{workspaceRoot}/coverage/{projectRoot}'],
        inputs: ['default', '^production'],
        cache: true,
        options: {
          command: createVitestCommand(null, 'run --config apps/api/vitest.config.ts'),
        },
      },
      'test:watch': {
        executor: 'nx:run-commands',
        cache: false,
        options: {
          command: createVitestCommand(null, '--config apps/api/vitest.config.ts'),
        },
      },
      'test:smoke': {
        executor: 'nx:run-commands',
        outputs: ['{workspaceRoot}/coverage/{projectRoot}-smoke'],
        inputs: ['default', '^production'],
        cache: true,
        options: {
          command: createVitestCommand(null, 'run --config apps/api/vitest.smoke.config.ts'),
        },
      },
    },
    task: {
      test: {
        executor: 'nx:run-commands',
        outputs: ['{workspaceRoot}/coverage/{projectRoot}'],
        inputs: ['default', '^production'],
        cache: true,
        options: {
          command: createVitestCommand('packages/task', 'run --config vitest.config.ts'),
          cwd: 'packages/task',
        },
      },
      'test:watch': {
        executor: 'nx:run-commands',
        cache: false,
        options: {
          command: createVitestCommand('packages/task', '--config vitest.config.ts'),
          cwd: 'packages/task',
        },
      },
      'test:integration': {
        executor: 'nx:run-commands',
        outputs: ['{workspaceRoot}/coverage/{projectRoot}'],
        inputs: ['default', '^production'],
        cache: false,
        options: {
          command: createVitestCommand(
            'packages/task',
            'run --config vitest.integration.config.ts',
          ),
          cwd: 'packages/task',
        },
      },
      'test:perf': {
        executor: 'nx:run-commands',
        outputs: ['{workspaceRoot}/coverage/{projectRoot}-perf'],
        inputs: ['default', '^production'],
        cache: false,
        options: {
          command: createVitestCommand(
            'packages/task',
            'run --config vitest.performance.config.ts',
          ),
          cwd: 'packages/task',
        },
      },
    },
    desktop: {
      test: {
        executor: 'nx:run-commands',
        outputs: ['{workspaceRoot}/coverage/{projectRoot}'],
        inputs: ['default', '^production'],
        cache: true,
        options: {
          command: createVitestCommand(null, 'run --config apps/desktop/vitest.config.ts'),
        },
      },
      'test:watch': {
        executor: 'nx:run-commands',
        cache: false,
        options: {
          command: createVitestCommand(null, '--config apps/desktop/vitest.config.ts'),
        },
      },
      'test:ipc': {
        executor: 'nx:run-commands',
        outputs: ['{workspaceRoot}/coverage/apps/desktop-ipc'],
        options: {
          command: createVitestCommand('apps/desktop', 'run --config vitest.ipc.config.ts'),
          cwd: 'apps/desktop',
        },
      },
      'test:main': {
        executor: 'nx:run-commands',
        outputs: ['{workspaceRoot}/coverage/apps/desktop-main'],
        options: {
          command: createVitestCommand('apps/desktop', 'run --config vitest.main.config.ts'),
          cwd: 'apps/desktop',
        },
      },
    },
    web: {
      test: {
        executor: 'nx:run-commands',
        outputs: ['{workspaceRoot}/coverage/{projectRoot}'],
        inputs: ['default', '^production'],
        cache: true,
        options: {
          command: createVitestCommand(null, 'run --config apps/web/vitest.config.ts'),
        },
      },
      'test:watch': {
        executor: 'nx:run-commands',
        cache: false,
        options: {
          command: createVitestCommand(null, '--config apps/web/vitest.config.ts'),
        },
      },
      e2e: {
        executor: 'nx:run-commands',
        outputs: [
          '{workspaceRoot}/apps/web/test-results',
          '{workspaceRoot}/apps/web/playwright-report',
        ],
        options: {
          command: 'playwright test',
          cwd: 'apps/web',
        },
        configurations: {
          ci: {
            command: 'playwright test --reporter=html,json,list',
          },
          headed: {
            command: 'playwright test --headed',
          },
          debug: {
            command: 'playwright test --debug',
          },
        },
      },
      'e2e:sync': {
        executor: 'nx:run-commands',
        outputs: [
          '{workspaceRoot}/apps/web/test-results',
          '{workspaceRoot}/apps/web/playwright-sync-report',
        ],
        options: {
          command: 'playwright test --config playwright.sync.config.ts',
          cwd: 'apps/web',
        },
        configurations: {
          headed: {
            command: 'playwright test --config playwright.sync.config.ts --headed',
          },
          debug: {
            command: 'playwright test --config playwright.sync.config.ts --debug',
          },
        },
      },
    },
  };

  return templates[projectName] ?? null;
}

function usesVitest(target) {
  if (!target || target.executor !== 'nx:run-commands') {
    return false;
  }

  const options = target.options ?? {};
  const command = pickCommand(options);
  return typeof command === 'string' && command.includes('vitest');
}

function pickCommand(options) {
  if (typeof options.command === 'string') {
    return options.command;
  }

  if (Array.isArray(options.commands) && options.commands.length === 1) {
    const first = options.commands[0];
    if (typeof first === 'string') {
      return first;
    }
    if (first && typeof first.command === 'string') {
      return first.command;
    }
  }

  return null;
}

function getArgValue(flag) {
  const index = rawArgs.indexOf(flag);
  if (index === -1) {
    return null;
  }

  return rawArgs[index + 1] ?? null;
}

function matchesProjectFilter(projectFile, projectName, filter) {
  if (!filter) {
    return true;
  }

  const normalizedFilter = filter.replaceAll('\\', '/');
  const relativePath = toRelative(projectFile);
  return projectName === normalizedFilter || relativePath === normalizedFilter;
}

async function checkDomainStructure(projectName, projectDir, errors) {
  const structuralRules = [
    {
      implementationDirectories: ['src/server/domain/aggregates'],
      testDirectories: ['src/server/domain/aggregates'],
      label: 'aggregate',
    },
    {
      implementationDirectories: ['src/server/domain/entities'],
      testDirectories: ['src/server/domain/entities', 'src/server/domain/aggregates'],
      label: 'entity',
    },
    {
      implementationDirectories: ['src/server/domain/services'],
      testDirectories: ['src/server/domain/services'],
      label: 'domain service',
    },
    {
      implementationDirectories: ['src/server/domain/value-objects'],
      testDirectories: ['src/server/domain/value-objects'],
      label: 'value object',
    },
  ];

  for (const rule of structuralRules) {
    const hasImplementations = await Promise.all(
      rule.implementationDirectories.map((directory) =>
        hasImplementationFiles(path.join(projectDir, directory)),
      ),
    );

    if (!hasImplementations.some(Boolean)) {
      continue;
    }

    const hasTests = await Promise.all(
      rule.testDirectories.map((directory) => hasTestFiles(path.join(projectDir, directory))),
    );

    if (hasTests.some(Boolean)) {
      continue;
    }

    errors.push(
      `${projectName}: ${rule.implementationDirectories.join(' or ')} contains implementation files but no ${rule.label} tests under the governed subtree`,
    );
  }
}

async function hasImplementationFiles(dir) {
  if (!(await fileExists(dir))) {
    return false;
  }

  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') continue;
      if (await hasImplementationFiles(fullPath)) {
        return true;
      }
      continue;
    }

    if (await isImplementationFile(fullPath, entry.name)) {
      return true;
    }
  }

  return false;
}

async function hasTestFiles(dir) {
  if (!(await fileExists(dir))) {
    return false;
  }

  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (await hasTestFiles(fullPath)) {
        return true;
      }
      continue;
    }

    if (isTestFile(entry.name)) {
      return true;
    }
  }

  return false;
}

async function isImplementationFile(fullPath, fileName) {
  if (isTestFile(fileName)) {
    return false;
  }

  if (!/\.[cm]?[jt]sx?$/.test(fileName)) {
    return false;
  }

  if (fileName === 'index.ts' || fileName.endsWith('.d.ts')) {
    return false;
  }

  const source = await readFile(fullPath, 'utf8');
  const normalized = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  return /\b(class|function|enum|createIdType|new ValueObject|extends ValueObject|extends AggregateRoot|extends Entity)\b/.test(
    normalized,
  );
}

function isTestFile(fileName) {
  return /\.(test|spec)\.[cm]?[jt]sx?$/.test(fileName);
}

async function fileExists(targetPath) {
  try {
    const stats = await readdir(path.dirname(targetPath));
    return stats.includes(path.basename(targetPath));
  } catch {
    return false;
  }
}

function areTargetsEqual(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

async function findProjectJsonFiles(root) {
  const found = [];
  await walk(root, found);
  return found;
}

async function walk(dir, found) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'coverage')
      continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath, found);
      continue;
    }

    if (entry.isFile() && entry.name === 'project.json') {
      found.push(fullPath);
    }
  }
}

function toRelative(filePath) {
  return path.relative(ROOT, filePath).replaceAll('\\', '/');
}
