#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import prettier from 'prettier';
import { buildTestArchitecture } from './lib/semantic-architecture.mjs';
import { buildFullAudit } from './lib/architecture-batch-audit.mjs';
import { buildFocusedTriage } from './lib/architecture-focus-triage.mjs';

const E2E = new Set([
  'apps/web/e2e/sync/goal-sync-regression.spec.ts',
  'apps/desktop/e2e/authentication/desktop-auth-flow.spec.mts',
  'apps/desktop/e2e/packaged-runtime/packaged-runtime.spec.ts',
]);
const tick = (s) => String.fromCharCode(96) + s + String.fromCharCode(96);
const issue = (n) => '[#' + n + '](https://github.com/BakerSean168/memoflow/issues/' + n + ')';
const fail = (reason) => {
  throw new Error('T2 closeout: ' + reason);
};

function table(head, rows) {
  const cell = (s) =>
    String(s ?? '')
      .replace(/\|/gu, '/')
      .replace(/[\r\n]+/gu, ' ');
  return [
    '| ' + head.join(' | ') + ' |',
    '| ' + head.map(() => '---').join(' | ') + ' |',
    ...rows.map((row) => '| ' + row.map(cell).join(' | ') + ' |'),
  ].join('\n');
}

async function buildCloseout(root) {
  const [architecture, rawFocus, rawHandoffs] = await Promise.all([
    buildTestArchitecture(root),
    fs.readFile(path.resolve(root, 'tools/test-system-v2/t2-focus-decisions.json'), 'utf8'),
    fs.readFile(path.resolve(root, 'tools/test-system-v2/t2-risk-handoffs.json'), 'utf8'),
  ]);
  const focus = JSON.parse(rawFocus);
  const handoffs = JSON.parse(rawHandoffs);
  if (architecture.issues.length > 0 || architecture.summary.review.warnings !== 0)
    fail('invalid architecture or stale SHA-bound reviews');
  const audit = await buildFullAudit(root, architecture);
  const triage = await buildFocusedTriage(root, audit, architecture);
  if (architecture.entries.length !== 1336 || triage.entries.length !== 46)
    fail('the old baseline changed: re-evaluate scope, do not silently mark T2 complete');
  if (focus.version !== 1 || focus.reviews.length !== 34)
    fail('expected 34 manually adjudicated previously-unreviewed candidates');
  if (handoffs.version !== 1 || handoffs.risks.length !== 11)
    fail('expected all 11 risk scenarios to have a handoff');
  const focused = new Map(focus.reviews.map((r) => [r.path, r]));
  if (focused.size !== focus.reviews.length) fail('duplicate focus file');
  const archByPath = new Map(architecture.entries.map((e) => [e.path, e]));
  const flagged = new Set(triage.entries.map((e) => e.path));
  for (const item of focus.reviews) {
    const entry = archByPath.get(item.path);
    if (!flagged.has(item.path) || !entry)
      fail('focused review path no longer flagged: ' + item.path);
    if (
      !['retain', 'browser-candidate'].includes(item.decision) ||
      !['T3-browser', 'no-immediate-change'].includes(item.nextPhase)
    )
      fail('focused file has unresolved disposition: ' + item.path);
    if ((item.decision === 'browser-candidate') !== (item.nextPhase === 'T3-browser'))
      fail('focused browser disposition lacks T3 handoff: ' + item.path);
    const source = await fs.readFile(path.resolve(root, item.path), 'utf8');
    if (createHash('sha256').update(source).digest('hex') !== item.sourceSha256)
      fail('source SHA mismatch: ' + item.path);
    if (
      !item.assertionEvidence?.length ||
      !item.assertionEvidence.every((s) => s && source.includes(s))
    )
      fail('source assertion evidence missing: ' + item.path);
    if (
      entry.reviewStatus !== 'reviewed-sample' ||
      entry.reviewDecision !== item.decision ||
      entry.testType !== 'component'
    )
      fail('manual review not applied: ' + item.path);
  }
  const byRisk = new Map(handoffs.risks.map((x) => [x.id, x]));
  if (byRisk.size !== handoffs.risks.length) fail('duplicate risk handoff');
  for (const risk of audit.risks) {
    const owner = byRisk.get(risk.id);
    if (
      !owner ||
      !owner.acceptanceGap?.trim() ||
      !owner.issues?.length ||
      owner.issues.some((id) => ![605, 606, 607, 608].includes(id))
    )
      fail('risk matrix scenario lacks concrete owner: ' + risk.id);
  }
  for (const id of byRisk.keys()) {
    if (!audit.risks.some((r) => r.id === id)) fail('unknown risk handoff: ' + id);
  }
  const rows = triage.entries.map((file) => {
    const review = archByPath.get(file.path);
    if (!review || review.reviewStatus !== 'reviewed-sample')
      fail('unreviewed flagged file: ' + file.path);
    let disposition;
    let followup = [];
    if (file.disposition === 'needs-gate-decision') {
      if (!E2E.has(file.path)) fail('new unowned E2E gate: ' + file.path);
      disposition = 'execution-evidence-needed';
      followup = [608];
    } else if (file.disposition === 'browser-behavior-review') {
      if (review.reviewDecision === 'browser-candidate') {
        disposition = 'browser-followup';
        followup = [605];
      } else if (review.reviewDecision === 'retain') {
        disposition = 'retain-simulated-dom';
      } else {
        fail('unadjudicated browser signal: ' + file.path);
      }
    } else {
      fail('new unadjudicated signal type: ' + file.disposition + ' ' + file.path);
    }
    return { path: file.path, disposition, followup, riskIds: file.riskIds };
  });
  const statuses = Object.fromEntries(
    [...new Set(rows.map((r) => r.disposition))].map((key) => [
      key,
      rows.filter((r) => r.disposition === key).length,
    ]),
  );
  if (
    statuses['execution-evidence-needed'] !== 3 ||
    statuses['browser-followup'] + statuses['retain-simulated-dom'] !== 43
  )
    fail('T2 risk-signal disposition counts do not match the reviewed baseline');
  return {
    reviewedPrimary: architecture.summary.review.reviewedPrimaryFiles,
    totalPrimary: architecture.entries.length,
    manuallyReviewedNow: focus.reviews.length,
    riskSignals: triage.entries.length,
    openDisposition: 0,
    riskScenarios: audit.risks.length,
    statuses,
    handoffs: handoffs.risks,
    rows,
  };
}

function report(result) {
  return [
    '# MemoFlow T2 定向风险收尾与阶段验收',
    '',
    '> T2 只完成全量自动扫描、风险信号的人工处置与后续责任移交。未完成的 T3/T4/T5 真实行为验证不视为已通过。',
    '> 基线为 WSL main@88d452338，本地 T1/T2 修改尚未 commit/push；未合并 PR #602，也未删除业务测试。',
    '',
    '## 一、调整后的 T2 验收',
    '',
    table(
      ['检查项', '结果'],
      [
        ['Inventory 唯一归属与 AST 静态扫描', result.totalPrimary + '/' + result.totalPrimary],
        ['本次定向风险候选人工复核', result.manuallyReviewedNow + '/' + result.manuallyReviewedNow],
        ['风险信号有明确处置', result.riskSignals + '/' + result.riskSignals],
        ['保留现有模拟 DOM 组件测试', result.statuses['retain-simulated-dom']],
        ['交给 T3 的 Browser 代表性验收候选', result.statuses['browser-followup']],
        ['交给 T5 的专项 E2E 运行收据', result.statuses['execution-evidence-needed']],
        ['业务风险矩阵已明确后续责任', result.riskScenarios + '/' + result.riskScenarios],
        [
          '累计代表性断言抽样（不再逐一读取剩余）',
          result.reviewedPrimary + '/' + result.totalPrimary,
        ],
        ['批准删除旧测试', '0'],
      ],
    ),
    '',
    '## 二、Issue 责任归属',
    '',
    '- T3 ' +
      issue(605) +
      '：合并成几条真正依赖 Chromium Tab、FocusTrap、Portal 和 Popover 语义的代表性场景，不将 43 个组件测试整体迁移。',
    '- T4 ' +
      issue(606) +
      '：Web E2E Worker 认证预备、会话缓存和每个 Test 独立业务数据；保留真实登录/注册专项。',
    '- T4 ' + issue(607) + '：PanelErrorBoundary 恢复草稿/实例保持的直接断言。',
    '- PR ' +
      '[#602](https://github.com/BakerSean168/memoflow/pull/602)' +
      '：63 个删除候选需先获得等价替代证据，不能直接整包删除。',
    '- T5 ' +
      issue(608) +
      '：三项特殊 E2E 真实门禁责任与 11 个高风险场景的目标 SHA Run/Release 证据。',
    '',
    '## 三、11 个业务风险场景',
    '',
    table(
      ['场景', '后续 Issue', '仍需验证的证据'],
      result.handoffs.map((r) => [r.id, r.issues.map((n) => '#' + n).join(', '), r.acceptanceGap]),
    ),
    '',
    '## 四、46 个静态风险候选的具体处置',
    '',
    '> 静态信号仍记录在原审查器中，不能把已经移交的验证缺口称为已修复。',
    '',
    table(
      ['文件', 'T2 判定', '后续 Issue'],
      result.rows.map((row) => [
        tick(row.path),
        row.disposition === 'retain-simulated-dom'
          ? '保持原组件执行器'
          : row.disposition === 'browser-followup'
            ? '保留旧测试，仅需 T3 真实浏览器代表场景'
            : '保留专项 E2E，由 T5 核实实际执行',
        row.followup.map((n) => '#' + n).join(', ') || '无需额外迁移',
      ]),
    ),
    '',
    '## 五、交付边界与再检查',
    '',
    '- 每项风险都在当前 SHA 对应的人工审查记录中有断言或执行阶段的证据。源码/清单变化、产生新静态风险、缺少 Issue 责任等都会使 T2 closeout check 失败。',
    '- **未完成**：生产故障修复、真实 Chrome 键盘试验、Web/Desktop 数据同步成功 Run、Windows 安装版与真实 Provider 测试、旧测试安全退休。它们是后续 Issue 的独立验收。',
    '- T2 不修改原 CI Workflow、Nx Primary Suite 归属，不扩大 skip，也不删除原测试。',
    '',
    '校验：',
    '',
    '    node tools/test-system-v2/t2-closeout.mjs --check',
    '    node tools/test-system-v2/t2-closeout.mjs --write-report',
    '',
  ].join('\n');
}

const command = process.argv[2] ?? '--check';
if (
  !['--check', '--summary', '--report', '--write-report'].includes(command) ||
  process.argv.length > 3
)
  throw new Error(
    'Usage: node tools/test-system-v2/t2-closeout.mjs [--check|--summary|--report|--write-report]',
  );
const value = await buildCloseout(process.cwd());
if (command === '--summary') console.log(JSON.stringify(value, null, 2));
else if (command === '--check')
  console.log(
    '[T2] reviewed ' +
      value.riskSignals +
      '/' +
      value.riskSignals +
      ' risk signals; browser=' +
      value.statuses['browser-followup'] +
      '; retained=' +
      value.statuses['retain-simulated-dom'] +
      '; E2E execution=' +
      value.statuses['execution-evidence-needed'] +
      '; risk handoffs=' +
      value.riskScenarios +
      '/' +
      value.riskScenarios +
      '; deletion approvals=0.',
  );
else if (command === '--report') console.log(report(value));
else {
  const dest = path.resolve(process.cwd(), 'docs/test/test-architecture-t2-closeout.md');
  const cfg = (await prettier.resolveConfig(dest)) ?? {};
  await fs.writeFile(dest, await prettier.format(report(value), { ...cfg, filepath: dest }));
  console.log('T2 closeout report: docs/test/test-architecture-t2-closeout.md');
}
