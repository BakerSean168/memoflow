#!/usr/bin/env node
import {
  buildTestArchitecture,
  TEST_TYPES,
  TEST_ROLES,
  VERIFICATION_DIMENSIONS,
  EXECUTION_ENVIRONMENTS,
  EXECUTION_PHASES,
} from './lib/semantic-architecture.mjs';

const args = process.argv.slice(2);
const valueFlags = [
  '--type',
  '--role',
  '--dimension',
  '--environment',
  '--phase',
  '--phase-status',
  '--domain',
  '--boundary',
  '--file',
  '--risk',
  '--evaluation-mode',
  '--review-status',
  '--decision',
  '--limit',
];
const switchFlags = [
  '--help',
  '--check',
  '--summary',
  '--stories',
  '--json',
  '--reviews',
  '--overlaps',
  '--review-queue',
];
function usage() {
  return [
    'MemoFlow Test System V2: four orthogonal classification dimensions',
    '  node tools/test-system-v2/architecture.mjs --summary',
    '  node tools/test-system-v2/architecture.mjs --type component --domain goal',
    '  node tools/test-system-v2/architecture.mjs --dimension accessibility',
    '  node tools/test-system-v2/architecture.mjs --dimension visual --environment real-browser',
    '  node tools/test-system-v2/architecture.mjs --dimension ai-evaluation --evaluation-mode recorded-replay',
    '  node tools/test-system-v2/architecture.mjs --role source-constraint',
    '  node tools/test-system-v2/architecture.mjs --phase pr --phase-status conditional',
    '  node tools/test-system-v2/architecture.mjs --phase nightly --phase-status not-confirmed',
    '  node tools/test-system-v2/architecture.mjs --risk WEB-DESKTOP-SYNC',
    '  node tools/test-system-v2/architecture.mjs --reviews --limit 50  # 人类可读 Markdown',
    '  node tools/test-system-v2/batch-audit.mjs --write-report  # 1336 文件全量扫描报告',
    '  node tools/test-system-v2/architecture.mjs --review-queue --type component',
    '  node tools/test-system-v2/architecture.mjs --overlaps',
    '  node tools/test-system-v2/architecture.mjs --stories --domain task',
    '  node tools/test-system-v2/architecture.mjs --check',
    'Allowed test types: ' + TEST_TYPES.join(', '),
    'Allowed verification dimensions: ' + VERIFICATION_DIMENSIONS.join(', '),
    'Allowed environments: ' + EXECUTION_ENVIRONMENTS.join(', '),
    'Allowed phases: ' + EXECUTION_PHASES.join(', '),
    'Smoke/governance/source checks are roles, not extra test levels.',
    'All auto-detected dimensions are candidates; a configured phase is NOT execution proof.',
  ].join('\n');
}
if (args.includes('--help')) {
  console.log(usage());
  process.exit(0);
}
const selections = {};
for (let i = 0; i < args.length; i++) {
  const flag = args[i];
  if (switchFlags.includes(flag)) {
    selections[flag] = true;
    continue;
  }
  if (
    !valueFlags.includes(flag) ||
    args[i + 1] === undefined ||
    args[i + 1].startsWith('--') ||
    selections[flag] !== undefined
  ) {
    console.error('[test-architecture] invalid option: ' + flag + '\n' + usage());
    process.exit(2);
  }
  selections[flag] = args[++i];
}
const validations = {
  '--type': TEST_TYPES,
  '--role': TEST_ROLES,
  '--dimension': VERIFICATION_DIMENSIONS,
  '--environment': EXECUTION_ENVIRONMENTS,
  '--phase': EXECUTION_PHASES,
  '--phase-status': ['available', 'conditional', 'not-confirmed'],
  '--evaluation-mode': ['recorded-replay', 'unverified'],
  '--review-status': ['pending', 'reviewed-sample', 'stale-review'],
  '--decision': ['retain', 'supplement', 'browser-candidate', 'rework-source-assertions'],
};
for (const [name, valid] of Object.entries(validations)) {
  if (selections[name] !== undefined && !valid.includes(selections[name])) {
    console.error('[test-architecture] invalid ' + name + ': ' + selections[name]);
    process.exit(2);
  }
}
if (selections['--phase-status'] && !selections['--phase']) {
  console.error('[test-architecture] --phase-status requires --phase');
  process.exit(2);
}
const limit = selections['--limit'] === undefined ? 25 : Number(selections['--limit']);
if (!Number.isInteger(limit) || limit < 1 || limit > 10000) {
  console.error('[test-architecture] --limit must be an integer from 1 to 10000');
  process.exit(2);
}
const report = await buildTestArchitecture(process.cwd());
if (report.issues.length) {
  console.error('[test-architecture] invalid architecture metadata:\n' + report.issues.join('\n'));
  process.exitCode = 1;
}
if (selections['--check']) {
  console.log(
    '[test-architecture] ' +
      report.summary.primaryFiles +
      ' primary files, ' +
      report.summary.riskScenarios +
      ' risk scenarios, ' +
      report.issues.length +
      ' metadata errors',
  );
  console.log(
    '[test-architecture] reviewed primary sample: ' +
      report.summary.review.reviewedPrimaryFiles +
      ' / ' +
      report.summary.primaryFiles +
      '; review warnings: ' +
      report.summary.review.warnings,
  );
  console.log(
    '[test-architecture] open risk gaps: ' +
      report.summary.riskScenariosWithExplicitGaps +
      ' (not proof of fulfilled verification or executed CI)',
  );
} else if (selections['--summary'] || args.length === 0) {
  console.log(
    JSON.stringify(
      {
        version: report.version,
        taxonomy: report.taxonomy,
        summary: report.summary,
      },
      null,
      2,
    ),
  );
} else if (selections['--overlaps']) {
  if (selections['--json']) {
    console.log(JSON.stringify({ groups: report.overlapGroups, retirementApproved: 0 }, null, 2));
  } else {
    console.log('# T2 跨层测试行为关系（不是删除清单）\n');
    console.log('| 分组 | 关系 | 决策 | 理由 |\n| --- | --- | --- | --- |');
    for (const group of report.overlapGroups) {
      console.log(
        '| ' +
          group.id +
          ' | ' +
          group.assessment +
          ' | 暂不退休 | ' +
          group.reason.replace(/\|/gu, '/') +
          ' |',
      );
    }
  }
} else if (selections['--risk']) {
  const scenario = report.riskMatrix.find((item) => item.id === selections['--risk']);
  if (!scenario) {
    console.error('[test-architecture] unknown risk id: ' + selections['--risk']);
    process.exitCode = 2;
  } else {
    console.log(JSON.stringify(scenario, null, 2));
  }
} else {
  const stories = Boolean(selections['--stories']);
  const rows = stories ? report.stories : report.entries;
  const riskPriorities = new Map();
  for (const risk of report.riskMatrix) {
    for (const evidence of risk.evidence) {
      const current = riskPriorities.get(evidence.path) ?? 0;
      riskPriorities.set(evidence.path, Math.max(current, risk.severity === 'P0' ? 100 : 50));
    }
  }
  let filtered = rows.filter(
    (item) =>
      (!selections['--domain'] || item.domain === selections['--domain']) &&
      (!selections['--file'] || item.path.includes(selections['--file'])) &&
      (!selections['--type'] || item.testType === selections['--type']) &&
      (!selections['--review-status'] ||
        (item.reviewStatus ?? 'pending') === selections['--review-status']) &&
      (!selections['--decision'] || item.reviewDecision === selections['--decision']) &&
      (!selections['--role'] || item.testRole === selections['--role']) &&
      (!selections['--boundary'] || item.boundary === selections['--boundary']) &&
      (!selections['--dimension'] ||
        (stories ? item.verificationDimensionCandidates : item.verificationDimensions).includes(
          selections['--dimension'],
        )) &&
      (!selections['--evaluation-mode'] ||
        item.evaluationMode === selections['--evaluation-mode']) &&
      (!selections['--environment'] ||
        item.executionEnvironment?.runtime === selections['--environment'] ||
        item.executionEnvironment?.confirmedDependencies?.includes(selections['--environment']) ||
        item.executionEnvironment?.dependencyCandidates?.some(
          (dependency) => dependency.environment === selections['--environment'],
        )) &&
      (!selections['--phase'] ||
        (selections['--phase-status']
          ? item.executionPhases?.[selections['--phase']]?.status === selections['--phase-status']
          : ['available', 'conditional'].includes(
              item.executionPhases?.[selections['--phase']]?.status,
            ))),
  );
  if (selections['--reviews']) {
    filtered = filtered.filter((item) => item.reviewStatus === 'reviewed-sample');
  }
  if (selections['--review-queue']) {
    filtered = filtered.filter((item) => (item.reviewStatus ?? 'pending') !== 'reviewed-sample');
    filtered.sort((a, b) => {
      const score = (item) =>
        (riskPriorities.get(item.path) ?? 0) +
        (item.testRole === 'source-constraint' ? 30 : 0) +
        (['component', 'contract', 'integration'].includes(item.testType) ? 20 : 0);
      return score(b) - score(a) || a.path.localeCompare(b.path);
    });
  }
  if ((selections['--reviews'] || selections['--review-queue']) && !selections['--json']) {
    console.log(
      '# MemoFlow T2 ' + (selections['--reviews'] ? '抽样审查记录' : '待审查队列') + '\n',
    );
    console.log(
      '匹配 ' +
        filtered.length +
        ' 文件；仅显示前 ' +
        Math.min(filtered.length, limit) +
        ' 条。' +
        ' 人工抽样审查不是全文件逐断言认证；待审项只经过自动分类。\n',
    );
    console.log('| 测试文件 | 分类 | 处理建议 | 行为/说明 |\n| --- | --- | --- | --- |');
    for (const item of filtered.slice(0, limit)) {
      const safe = (s) =>
        String(s ?? '')
          .replace(/\|/gu, '/')
          .replace(/[\r\n]/gu, ' ')
          .slice(0, 115);
      console.log(
        '| ' +
          safe(item.path) +
          ' | ' +
          safe(item.testType ?? item.testRole) +
          ' | ' +
          safe(item.reviewDecision ?? '待核验') +
          ' | ' +
          safe(item.reviewedBehavior ?? item.testCaseHints?.[0] ?? '待评审') +
          ' |',
      );
    }
  } else
    console.log(
      JSON.stringify(
        {
          totalMatching: filtered.length,
          displayed: Math.min(filtered.length, limit),
          entries: filtered.slice(0, limit),
          notice: stories
            ? 'Storybook scenarios are not primary tests or execution receipts.'
            : selections['--reviews']
              ? 'Reviewed primary intent covers representative assertions, not a full per-test certification.'
              : 'Auto-classification and configured CI phases are candidates, not proven coverage.',
        },
        null,
        2,
      ),
    );
}
