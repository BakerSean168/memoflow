#!/usr/bin/env node
/** Pinned GovernanceRuleBundle -> engineering check/report/proposal CLI (GOV-1904). */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { loadPinnedBundle } from './lib/published-rule-bundle.mjs';
import {
  createAutofixProposalReport,
  runMappedEngineeringChecks,
  validateEngineeringAdapterRegistry,
} from './lib/governance-rule-engineering-adapter.mjs';
import { runPackageInternalBoundaryAudit } from './lib/package-internal-boundary-runner.mjs';

const ROOT = path.join(import.meta.dirname, '..', '..');
const REGISTRY = 'tools/governance/engineering-rule-adapters.json';
const PIN_MANIFEST = 'tools/governance/pinned-rule-bundles.json';

const ENGINEERING_RUNNERS = new Map([
  [
    'package-internal-boundary',
    {
      checkScript: 'tools/governance/package-internal-boundary-audit.mjs',
      run: () => runPackageInternalBoundaryAudit(ROOT),
    },
  ],
]);

function parseArgs(argv) {
  const args = { mode: 'check' };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--bundle') args.bundle = argv[++i];
    else if (argv[i] === '--mode') args.mode = argv[++i];
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if (!args.bundle) {
    throw new Error(
      'Usage: governance-rule-bundle-adapter.mjs --bundle <repo-relative.json> [--mode check|report|autofix-proposal]',
    );
  }
  if (!['check', 'report', 'autofix-proposal'].includes(args.mode)) {
    throw new Error(`Unsupported mode: ${args.mode}`);
  }
  return args;
}

function readJson(relPath) {
  return JSON.parse(readFileSync(path.join(ROOT, relPath), 'utf8'));
}

function expectedHashFor(bundlePath) {
  const manifest = readJson(PIN_MANIFEST);
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.bundles)) {
    throw new Error('Unsupported pinned Governance bundle manifest');
  }
  const pin = manifest.bundles.find((entry) => entry.path === bundlePath);
  if (!pin) throw new Error(`Governance bundle '${bundlePath}' is not repository-pinned`);
  return pin.semanticHash;
}

async function executeCheck(adapter) {
  const registered = ENGINEERING_RUNNERS.get(adapter.adapterId);
  if (!registered) {
    throw new Error(`No explicit engineering runner registered for ${adapter.adapterId}`);
  }
  if (registered.checkScript !== adapter.checkScript) {
    throw new Error(
      `Engineering runner metadata mismatch for ${adapter.adapterId}: expected ${registered.checkScript}`,
    );
  }

  const result = registered.run();
  return {
    status: result.passed ? 'passed' : 'failed',
    exitCode: result.passed ? 0 : 1,
    stdout: result.passed ? `audited ${result.auditedFiles} files` : '',
    stderr: result.passed ? '' : JSON.stringify(result.violations),
  };
}

function printCheck(report) {
  console.log(`[governance-rule-bundle] ${report.bundle.semanticHash}`);
  console.log(
    `rules=${report.summary.totalRules} mapped=${report.summary.mappedRules} unmapped=${report.summary.unmappedRules} failed=${report.summary.failedChecks}`,
  );
  for (const rule of report.rules) {
    if (rule.mapping === 'unmapped') console.log(`- ${rule.ruleKey}: unmapped (non-enforcing)`);
    else {
      console.log(
        `- ${rule.ruleKey}: ${rule.adapterId} [${rule.enforcement}] ${rule.check.status}`,
      );
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const expectedHash = expectedHashFor(args.bundle);
  const { bundle } = loadPinnedBundle({
    root: ROOT,
    bundlePath: args.bundle,
    gitState: { tracked: false, clean: false },
    expectedHash,
  });
  const registry = validateEngineeringAdapterRegistry(readJson(REGISTRY));
  const report = await runMappedEngineeringChecks({ bundle, registry, executeCheck });

  if (args.mode === 'report') console.log(JSON.stringify(report, null, 2));
  else if (args.mode === 'autofix-proposal') {
    console.log(JSON.stringify(createAutofixProposalReport({ report, registry }), null, 2));
  } else {
    printCheck(report);
    if (report.summary.failedChecks > 0) process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(
    `[governance-rule-bundle] ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
