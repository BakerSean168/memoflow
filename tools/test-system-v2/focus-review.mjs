#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';
import prettier from 'prettier';
import { buildTestArchitecture } from './lib/semantic-architecture.mjs';
import { buildFullAudit } from './lib/architecture-batch-audit.mjs';
import { buildFocusedTriage } from './lib/architecture-focus-triage.mjs';
import { renderFocusedReport } from './lib/architecture-focus-report.mjs';

const args = process.argv.slice(2);
if (
  args.length > 1 ||
  (args[0] && !['--write-report', '--report', '--summary'].includes(args[0]))
) {
  throw new Error(
    'Usage: node tools/test-system-v2/focus-review.mjs [--write-report|--report|--summary]',
  );
}
const root = process.cwd();
const architecture = await buildTestArchitecture(root);
if (architecture.issues.length > 0) {
  throw new Error('Invalid Test Architecture: ' + architecture.issues.join('; '));
}
const audit = await buildFullAudit(root, architecture);
const triage = await buildFocusedTriage(root, audit, architecture);
if (triage.summary.flaggedPrimary !== audit.summary.flaggedFiles) {
  throw new Error('Focused triage did not preserve the original set of flagged files');
}
if (args[0] === '--summary') {
  console.log(JSON.stringify(triage.summary, null, 2));
} else {
  const report = renderFocusedReport(triage, architecture);
  if (args[0] !== '--write-report') {
    console.log(report);
  } else {
    const file = path.resolve(root, 'docs/test/test-architecture-t2-triage.md');
    const config = (await prettier.resolveConfig(file)) ?? {};
    await fs.writeFile(file, await prettier.format(report, { ...config, filepath: file }));
    console.log(
      'T2 triage: ' +
        triage.summary.scannedPrimary +
        ' tests inspected, ' +
        triage.summary.flaggedPrimary +
        ' flagged, ' +
        triage.summary.reviewedByHumanSample +
        ' sampled reviews, 0 tests approved for retirement.',
    );
    console.log('Readable report: docs/test/test-architecture-t2-triage.md');
  }
}
