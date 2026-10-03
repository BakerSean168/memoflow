#!/usr/bin/env node
/** Normal Engineering Governance CLI: repository-native inputs, explicit read-only runners. */
import path from 'node:path';
import { loadEngineeringRuleSource } from './lib/engineering-rule-source.mjs';
import {
  createAutofixProposalReport,
  runEngineeringChecks,
} from './lib/governance-rule-engineering-adapter.mjs';
import { executeEngineeringCheck } from './lib/engineering-rule-runner.mjs';

const ROOT = path.join(import.meta.dirname, '..', '..');

function parseArgs(argv) {
  const args = { mode: 'check' };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (!['--source', '--mode'].includes(flag) || !argv[i + 1] || argv[i + 1].startsWith('--')) {
      throw new Error(`Unknown or incomplete argument: ${flag}`);
    }
    args[flag === '--source' ? 'sourcePath' : 'mode'] = argv[++i];
  }
  if (!['check', 'report', 'autofix-proposal'].includes(args.mode))
    throw new Error(`Unsupported mode: ${args.mode}`);
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const source = loadEngineeringRuleSource({ root: ROOT, sourcePath: args.sourcePath });
  const registry = { schemaVersion: 1, adapters: source.adapters };
  const report = await runEngineeringChecks({
    source,
    registry,
    executeCheck: (adapter) => executeEngineeringCheck(ROOT, adapter),
  });
  if (args.mode === 'report') console.log(JSON.stringify(report, null, 2));
  else if (args.mode === 'autofix-proposal')
    console.log(JSON.stringify(createAutofixProposalReport({ report, registry }), null, 2));
  else {
    console.log(`[engineering-rules] ${report.bundle.semanticHash}`);
    console.log(
      `rules=${report.summary.totalRules} mapped=${report.summary.mappedRules} unmapped=${report.summary.unmappedRules} failed=${report.summary.failedChecks}`,
    );
    for (const rule of report.rules) {
      console.log(
        rule.mapping === 'unmapped'
          ? `- ${rule.ruleKey}: unmapped (non-enforcing)`
          : `- ${rule.ruleKey}: ${rule.adapterId} [${rule.enforcement}] ${rule.check.status}`,
      );
    }
    if (report.summary.failedChecks > 0) process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`[engineering-rules] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
