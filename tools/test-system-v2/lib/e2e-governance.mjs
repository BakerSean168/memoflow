import { promises as fs } from 'node:fs';
import path from 'node:path';
import fg from 'fast-glob';

export const E2E_OWNERSHIP_VERSION = 2;
export const E2E_RETIREMENT_VERSION = 1;

const VALID_LANES = new Set([
  'required',
  'nightly',
  'specialized',
  'secure-acceptance',
  'local-validation',
  'visual-artifact',
  'reference',
  'desktop',
]);
const VALID_ROLES = new Set(['canonical', 'supplemental', 'reference', 'artifact']);
const VALID_LIFECYCLES = new Set(['active', 'retired']);
const VALID_EXECUTION_KINDS = new Set(['nx', 'manual']);
const VALID_AUTOMATION_KINDS = new Set(['github-workflow']);
const AUTOMATION_REQUIRED_LANES = new Set(['required', 'nightly']);

function normalizePath(value) {
  return value.replaceAll(path.sep, '/');
}

function commandsForTarget(target) {
  const options = target?.options ?? {};
  if (typeof options.command === 'string') return [options.command];
  if (!Array.isArray(options.commands)) return [];
  return options.commands
    .map((command) => (typeof command === 'string' ? command : command?.command))
    .filter((command) => typeof command === 'string');
}

async function loadProjects(root) {
  const files = await fg(
    ['project.json', 'apps/**/project.json', 'packages/**/project.json', 'tools/**/project.json'],
    {
      cwd: root,
      ignore: ['**/node_modules/**', '**/.venv/**'],
    },
  );
  const projects = new Map();
  for (const file of files.sort()) {
    const project = JSON.parse(await fs.readFile(path.resolve(root, file), 'utf8'));
    if (project.name) projects.set(project.name, { file: normalizePath(file), project });
  }
  return projects;
}

export async function loadE2EOwnership(root) {
  const target = path.resolve(root, 'tools/test-system-v2/e2e-ownership.json');
  return JSON.parse(await fs.readFile(target, 'utf8'));
}

export async function loadE2ERetirement(root) {
  const target = path.resolve(root, 'tools/test-system-v2/e2e-retirement.json');
  return JSON.parse(await fs.readFile(target, 'utf8'));
}

export async function analyzeE2ERetirement(root, contract = null) {
  contract ??= await loadE2ERetirement(root);
  const issues = [];

  if (contract?.version !== E2E_RETIREMENT_VERSION) {
    issues.push({
      reason: 'unsupported-retirement-contract-version',
      expected: E2E_RETIREMENT_VERSION,
      actual: contract?.version ?? null,
    });
  }

  for (const retired of contract?.retiredSpecs ?? []) {
    const target = path.resolve(root, retired.path);
    const exists = await fs
      .access(target)
      .then(() => true)
      .catch(() => false);
    if (exists) {
      issues.push({
        path: retired.path,
        reason: 'retired-spec-reintroduced',
        detail: retired.reason ?? null,
      });
    }
  }

  const sourceFiles = await fg(
    [
      'apps/**/e2e/**/*.{ts,mts,cts,js,mjs,cjs}',
      'apps/**/playwright*.config.{ts,mts,cts,js,mjs,cjs}',
    ],
    {
      cwd: root,
      ignore: ['**/node_modules/**', '**/dist/**', '**/test-results/**'],
    },
  );

  for (const file of sourceFiles.sort()) {
    const source = await fs.readFile(path.resolve(root, file), 'utf8');
    for (const reference of contract?.forbiddenReferences ?? []) {
      if (typeof reference.needle !== 'string' || reference.needle === '') continue;
      let offset = source.indexOf(reference.needle);
      while (offset >= 0) {
        const line = source.slice(0, offset).split('\n').length;
        issues.push({
          path: normalizePath(file),
          line,
          reason: 'retired-reference',
          id: reference.id ?? null,
          needle: reference.needle,
          replacement: reference.replacement ?? null,
        });
        offset = source.indexOf(reference.needle, offset + reference.needle.length);
      }
    }
  }

  return {
    version: E2E_RETIREMENT_VERSION,
    issues: issues.sort((left, right) =>
      `${left.path ?? ''}:${left.line ?? 0}:${left.reason}`.localeCompare(
        `${right.path ?? ''}:${right.line ?? 0}:${right.reason}`,
      ),
    ),
    retiredSpecCount: contract?.retiredSpecs?.length ?? 0,
    forbiddenReferenceCount: contract?.forbiddenReferences?.length ?? 0,
  };
}

function parseNxTarget(value) {
  if (typeof value !== 'string') return null;
  const separator = value.indexOf(':');
  if (separator <= 0 || separator === value.length - 1) return null;
  return { projectName: value.slice(0, separator), targetName: value.slice(separator + 1) };
}

async function validateExecution(root, collectorId, ownership, projects) {
  const issues = [];
  const execution = ownership?.execution;
  if (!execution || !VALID_EXECUTION_KINDS.has(execution.kind)) {
    issues.push({ collector: collectorId, reason: 'invalid-execution-kind' });
    return issues;
  }

  const configBase = path.basename(collectorId);
  if (execution.kind === 'manual') {
    if (typeof execution.command !== 'string' || !execution.command.includes(configBase)) {
      issues.push({ collector: collectorId, reason: 'manual-command-does-not-bind-collector' });
    }
    return issues;
  }

  const parsed = parseNxTarget(execution.target);
  if (!parsed) {
    issues.push({
      collector: collectorId,
      reason: 'invalid-nx-target',
      target: execution.target ?? null,
    });
    return issues;
  }
  const projectEntry = projects.get(parsed.projectName);
  const target = projectEntry?.project?.targets?.[parsed.targetName];
  if (!target) {
    issues.push({ collector: collectorId, reason: 'missing-nx-target', target: execution.target });
    return issues;
  }

  const commands = commandsForTarget(target);
  const commandText = commands.join('\n');
  const targetCwd = normalizePath(target.options?.cwd ?? path.dirname(projectEntry.file));
  const collectorDir = normalizePath(path.dirname(collectorId));
  const defaultConfigBound =
    configBase === 'playwright.config.ts' &&
    targetCwd === collectorDir &&
    /\bplaywright\b/u.test(commandText) &&
    /\btest\b/u.test(commandText);

  if (commandText.includes(configBase) || commandText.includes(collectorId) || defaultConfigBound) {
    return issues;
  }

  if (typeof execution.entrypoint === 'string') {
    const entrypointBase = path.basename(execution.entrypoint);
    if (!commandText.includes(execution.entrypoint) && !commandText.includes(entrypointBase)) {
      issues.push({
        collector: collectorId,
        reason: 'nx-target-does-not-bind-entrypoint',
        target: execution.target,
        entrypoint: execution.entrypoint,
      });
      return issues;
    }
    const entrypointPath = path.resolve(root, execution.entrypoint);
    const source = await fs.readFile(entrypointPath, 'utf8').catch(() => '');
    if (!source.includes(configBase)) {
      issues.push({
        collector: collectorId,
        reason: 'entrypoint-does-not-bind-collector',
        target: execution.target,
        entrypoint: execution.entrypoint,
      });
    }
    return issues;
  }

  issues.push({
    collector: collectorId,
    reason: 'nx-target-does-not-bind-collector',
    target: execution.target,
  });
  return issues;
}

async function validateAutomation(root, collectorId, ownership) {
  const issues = [];
  const automations = ownership?.automation;

  if (
    AUTOMATION_REQUIRED_LANES.has(ownership?.lane) &&
    (!Array.isArray(automations) || automations.length === 0)
  ) {
    issues.push({
      collector: collectorId,
      reason: 'missing-automation-owner',
      lane: ownership.lane,
    });
    return issues;
  }

  if (automations == null) return issues;
  if (!Array.isArray(automations)) {
    issues.push({ collector: collectorId, reason: 'invalid-automation-contract' });
    return issues;
  }

  const configBase = path.basename(collectorId);
  for (const automation of automations) {
    if (!automation || !VALID_AUTOMATION_KINDS.has(automation.kind)) {
      issues.push({
        collector: collectorId,
        reason: 'invalid-automation-kind',
        kind: automation?.kind ?? null,
      });
      continue;
    }
    if (typeof automation.workflow !== 'string' || automation.workflow === '') {
      issues.push({ collector: collectorId, reason: 'missing-automation-workflow' });
      continue;
    }

    const workflowPath = path.resolve(root, automation.workflow);
    const workflowSource = await fs.readFile(workflowPath, 'utf8').catch(() => null);
    if (workflowSource == null) {
      issues.push({
        collector: collectorId,
        reason: 'missing-automation-workflow',
        workflow: automation.workflow,
      });
      continue;
    }

    if (typeof automation.target === 'string') {
      if (!workflowSource.includes(automation.target)) {
        issues.push({
          collector: collectorId,
          reason: 'workflow-does-not-bind-target',
          workflow: automation.workflow,
          target: automation.target,
        });
      }
      continue;
    }

    if (typeof automation.entrypoint === 'string') {
      const entrypointBase = path.basename(automation.entrypoint);
      if (
        !workflowSource.includes(automation.entrypoint) &&
        !workflowSource.includes(entrypointBase)
      ) {
        issues.push({
          collector: collectorId,
          reason: 'workflow-does-not-bind-entrypoint',
          workflow: automation.workflow,
          entrypoint: automation.entrypoint,
        });
        continue;
      }
      const entrypointSource = await fs
        .readFile(path.resolve(root, automation.entrypoint), 'utf8')
        .catch(() => null);
      if (entrypointSource == null) {
        issues.push({
          collector: collectorId,
          reason: 'missing-automation-entrypoint',
          entrypoint: automation.entrypoint,
        });
      } else if (!entrypointSource.includes(configBase)) {
        issues.push({
          collector: collectorId,
          reason: 'automation-entrypoint-does-not-bind-collector',
          entrypoint: automation.entrypoint,
        });
      }
      continue;
    }

    issues.push({
      collector: collectorId,
      reason: 'automation-binding-missing-target-or-entrypoint',
      workflow: automation.workflow,
    });
  }

  return issues;
}

export async function analyzeE2EOwnership(root, inventory, contract = null) {
  contract ??= await loadE2EOwnership(root);
  const issues = [];
  const projects = await loadProjects(root);
  const playwrightCollectors = inventory.collectors.filter(
    (collector) => collector.type === 'primary' && collector.runner === 'playwright',
  );
  const e2eEntries = inventory.primary.filter((entry) => entry.primarySuite === 'e2e');
  const collectorIds = new Set(playwrightCollectors.map((collector) => collector.id));
  const e2ePaths = new Set(e2eEntries.map((entry) => entry.path));
  const contractCollectors = contract?.collectors ?? {};
  const contractSpecs = contract?.specs ?? {};

  if (contract?.version !== E2E_OWNERSHIP_VERSION) {
    issues.push({
      reason: 'unsupported-contract-version',
      expected: E2E_OWNERSHIP_VERSION,
      actual: contract?.version ?? null,
    });
  }

  for (const collector of playwrightCollectors) {
    const ownership = contractCollectors[collector.id];
    if (!ownership) {
      issues.push({ collector: collector.id, reason: 'missing-collector-ownership' });
      continue;
    }
    if (!VALID_LANES.has(ownership.lane)) {
      issues.push({
        collector: collector.id,
        reason: 'invalid-lane',
        lane: ownership.lane ?? null,
      });
    }
    if (!VALID_LIFECYCLES.has(ownership.lifecycle)) {
      issues.push({
        collector: collector.id,
        reason: 'invalid-collector-lifecycle',
        lifecycle: ownership.lifecycle ?? null,
      });
    }
    issues.push(...(await validateExecution(root, collector.id, ownership, projects)));
    issues.push(...(await validateAutomation(root, collector.id, ownership)));
  }

  for (const collectorId of Object.keys(contractCollectors)) {
    if (!collectorIds.has(collectorId)) {
      issues.push({ collector: collectorId, reason: 'stale-collector-ownership' });
    }
  }

  for (const entry of e2eEntries) {
    const ownership = contractSpecs[entry.path];
    if (!ownership) {
      issues.push({ path: entry.path, reason: 'missing-spec-ownership' });
      continue;
    }
    if (!VALID_ROLES.has(ownership.role)) {
      issues.push({ path: entry.path, reason: 'invalid-role', role: ownership.role ?? null });
    }
    if (!VALID_LIFECYCLES.has(ownership.lifecycle)) {
      issues.push({
        path: entry.path,
        reason: 'invalid-spec-lifecycle',
        lifecycle: ownership.lifecycle ?? null,
      });
    }
    if (typeof ownership.surface !== 'string' || ownership.surface.trim() === '') {
      issues.push({ path: entry.path, reason: 'missing-surface-owner' });
    }
    if (!entry.collectors.includes(ownership.primaryCollector)) {
      issues.push({
        path: entry.path,
        reason: 'primary-collector-does-not-collect-spec',
        primaryCollector: ownership.primaryCollector ?? null,
        collectors: entry.collectors,
      });
    }
  }

  for (const specPath of Object.keys(contractSpecs)) {
    if (!e2ePaths.has(specPath)) {
      issues.push({ path: specPath, reason: 'stale-spec-ownership' });
    }
  }

  const countsByLane = {};
  for (const entry of e2eEntries) {
    const specOwnership = contractSpecs[entry.path];
    const collectorOwnership = specOwnership
      ? contractCollectors[specOwnership.primaryCollector]
      : null;
    const lane = collectorOwnership?.lane ?? 'unowned';
    countsByLane[lane] = (countsByLane[lane] ?? 0) + 1;
  }

  const countsByRole = {};
  for (const entry of e2eEntries) {
    const role = contractSpecs[entry.path]?.role ?? 'unowned';
    countsByRole[role] = (countsByRole[role] ?? 0) + 1;
  }

  return {
    version: E2E_OWNERSHIP_VERSION,
    issues: issues.sort((left, right) =>
      `${left.path ?? ''}:${left.collector ?? ''}:${left.reason}`.localeCompare(
        `${right.path ?? ''}:${right.collector ?? ''}:${right.reason}`,
      ),
    ),
    countsByLane: Object.fromEntries(Object.entries(countsByLane).sort()),
    countsByRole: Object.fromEntries(Object.entries(countsByRole).sort()),
    automatedCollectorCount: Object.values(contractCollectors).filter(
      (ownership) => Array.isArray(ownership.automation) && ownership.automation.length > 0,
    ).length,
    automationBindingCount: Object.values(contractCollectors).reduce(
      (count, ownership) =>
        count + (Array.isArray(ownership.automation) ? ownership.automation.length : 0),
      0,
    ),
  };
}

export function decorateE2EOwnership(inventory, contract) {
  return {
    ...inventory,
    collectors: inventory.collectors.map((collector) =>
      collector.runner === 'playwright' && contract.collectors?.[collector.id]
        ? { ...collector, e2eOwnership: contract.collectors[collector.id] }
        : collector,
    ),
    primary: inventory.primary.map((entry) =>
      entry.primarySuite === 'e2e' && contract.specs?.[entry.path]
        ? { ...entry, e2eOwnership: contract.specs[entry.path] }
        : entry,
    ),
  };
}
