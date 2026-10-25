#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';
import prettier from 'prettier';
import { buildTestArchitecture, TEST_TYPES, TEST_ROLES } from './lib/semantic-architecture.mjs';
import { buildFullAudit, FINDINGS } from './lib/architecture-batch-audit.mjs';
import { renderHumanReport, renderFileTable } from './lib/architecture-audit-report.mjs';

const args = process.argv.slice(2);
const flags = {};
const values = new Set(['--finding', '--type', '--role', '--review', '--limit']);
const switches = new Set(['--help', '--report', '--write-report', '--table', '--json']);
function usage() {
  return [
    'MemoFlow 测试架构人类可读审查报告：',
    '  node tools/test-system-v2/batch-audit.mjs --write-report',
    '  node tools/test-system-v2/batch-audit.mjs --report',
    '  node tools/test-system-v2/batch-audit.mjs --table --limit 30',
    '  node tools/test-system-v2/batch-audit.mjs --table --type component',
    '  node tools/test-system-v2/batch-audit.mjs --table --finding no-direct-assertion',
    '  node tools/test-system-v2/batch-audit.mjs --json  # tools/debug only',
    'finding 可选: ' + Object.keys(FINDINGS).join(', '),
  ].join('\n');
}
for (let i = 0; i < args.length; i++) {
  const flag = args[i];
  if (switches.has(flag)) {
    flags[flag] = true;
    continue;
  }
  if (!values.has(flag) || !args[i + 1] || args[i + 1].startsWith('--') || flags[flag]) {
    console.error('Invalid option: ' + flag + '\n' + usage());
    process.exit(2);
  }
  flags[flag] = args[++i];
}
if (flags['--help']) {
  console.log(usage());
  process.exit(0);
}
if (flags['--finding'] && !FINDINGS[flags['--finding']])
  throw Error('unknown finding ' + flags['--finding']);
if (flags['--type'] && !TEST_TYPES.includes(flags['--type'])) throw Error('invalid test type');
if (flags['--role'] && !TEST_ROLES.includes(flags['--role'])) throw Error('invalid test role');
if (
  flags['--review'] &&
  !['reviewed-sample', 'pending', 'stale-review'].includes(flags['--review'])
)
  throw Error('invalid review status');
const limit = Number(flags['--limit'] ?? 30);
if (!Number.isInteger(limit) || limit < 1 || limit > 2000) throw Error('--limit must be 1..2000');
const root = process.cwd();
const architecture = await buildTestArchitecture(root);
if (architecture.issues.length)
  throw Error('T1 architecture invalid: ' + architecture.issues.join('; '));
const audit = await buildFullAudit(root, architecture);
if (flags['--json']) {
  console.log(JSON.stringify(audit, null, 2));
} else if (flags['--table']) {
  console.log(
    renderFileTable(audit, {
      finding: flags['--finding'],
      type: flags['--type'],
      role: flags['--role'],
      review: flags['--review'],
      limit,
    }),
  );
} else {
  const report = renderHumanReport(audit);
  if (flags['--write-report']) {
    const dest = path.resolve(root, 'docs/test/test-architecture-t2-full-audit.md');
    const config = (await prettier.resolveConfig(dest)) ?? {};
    await fs.writeFile(dest, await prettier.format(report, { ...config, filepath: dest }));
    console.log(
      '审查完成：' +
        audit.summary.scannedFiles +
        ' 文件；约 ' +
        audit.summary.caseDeclarations +
        ' 测试声明；抽样核实 ' +
        audit.summary.manuallyReviewedSamples +
        '；静态排查标记 ' +
        audit.summary.flaggedFiles +
        '；可安全退休 0。',
    );
    console.log('人类可读报告：' + path.relative(root, dest));
  } else console.log(report);
}
