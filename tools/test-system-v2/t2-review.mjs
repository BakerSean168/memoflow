#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promises as fs, readFileSync } from 'node:fs';
import path from 'node:path';
import prettier from 'prettier';
import {
  declaredWebSpecs,
  inspectAuthPrecondition,
  inspectRetirementProposal,
  SPEC_GROUPS,
} from './lib/t2-pr-evidence.mjs';

const BASE = 'b1186f738';
const PROPOSAL = 'cffcf9b15';
const BT = String.fromCharCode(96);
const codePath = (value) => BT + value + BT;
function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
}
const sourceCache = new Map();
function source(ref, filename) {
  const key = ref + ':' + filename;
  if (!sourceCache.has(key)) sourceCache.set(key, git('show', key));
  return sourceCache.get(key);
}
function safeCell(value) {
  return String(value ?? '')
    .replace(/\|/gu, '\\|')
    .replace(/\r?\n/gu, ' ')
    .trim();
}
function table(head, body) {
  return [
    '| ' + head.join(' | ') + ' |',
    '| ' + head.map(() => '---').join(' | ') + ' |',
    ...body.map((row) => '| ' + row.map(safeCell).join(' | ') + ' |'),
  ].join('\n');
}
function auditAuth(ref) {
  const entries = [];
  for (const [lane, listing] of Object.entries(SPEC_GROUPS)) {
    const specs = declaredWebSpecs(source(ref, listing));
    for (const spec of specs) {
      const file = 'apps/web/e2e/' + spec;
      entries.push({ lane, ...inspectAuthPrecondition(file, source(ref, file)) });
    }
  }
  const local = git('ls-tree', '-r', '--name-only', ref, '--', 'apps/web/e2e/local-docker')
    .trim()
    .split('\n')
    .filter((file) => /\/(?:core-product-phase-[a-z]|keyboard-first)\.spec\.ts$/u.test(file));
  for (const file of local) {
    entries.push({ lane: 'local-docker', ...inspectAuthPrecondition(file, source(ref, file)) });
  }
  const fixture = source(ref, 'apps/web/e2e/ai/goal-workflow/goal-workflow.fixture.ts');
  const account = source(ref, 'apps/web/e2e/account/account-settings.helpers.ts');
  const indirectGoalUi =
    fixture.includes("from '../../helpers/testHelpers'") &&
    /registerAndLogin\(page,/u.test(fixture);
  const indirectAccountUi =
    account.includes("from '../helpers/testHelpers'") && /registerAndLogin\(page,/u.test(account);
  const byLane = {};
  for (const lane of ['required-flow', 'nightly-audit', 'local-docker']) {
    const specs = entries.filter((e) => e.lane === lane);
    byLane[lane] = {
      specs: specs.length,
      cases: specs.reduce((sum, e) => sum + e.declaredCases, 0),
      directUiFiles: specs.filter((e) => !e.isAuthFeatureTest && e.directUiRegistration).length,
      directApiFiles: specs.filter((e) => !e.isAuthFeatureTest && e.directApiRegistration).length,
      indirectUiFiles: specs.filter(
        (e) =>
          !e.isAuthFeatureTest &&
          ((e.goalWorkflowFixture && indirectGoalUi) ||
            (e.accountSettingsFixture && indirectAccountUi)),
      ).length,
      beforeEachUiCases: specs
        .filter((e) => !e.isAuthFeatureTest && e.uiRegistrationBeforeEach)
        .reduce((sum, e) => sum + e.declaredCases, 0),
      beforeEachApiCases: specs
        .filter((e) => !e.isAuthFeatureTest && e.apiRegistrationBeforeEach)
        .reduce((sum, e) => sum + e.declaredCases, 0),
    };
  }
  return { ref, byLane, entries, indirectGoalUi, indirectAccountUi };
}
function collectEvidence() {
  const before = auditAuth(BASE),
    candidate = auditAuth(PROPOSAL);
  const status = git('diff', '--name-status', BASE + '...' + PROPOSAL)
    .trim()
    .split('\n')
    .map((row) => row.split('\t'));
  const deleted = status.filter((row) => row[0] === 'D').map((row) => row[1]);
  const retired = deleted.map((file) => inspectRetirementProposal(file, source(BASE, file)));
  const kinds = [
    'mixed-runtime-behavior',
    'path-or-schema-invariant',
    'source-text-candidate',
    'screenshot-artifact',
  ];
  const counts = Object.fromEntries(
    kinds.map((kind) => [kind, retired.filter((item) => item.category === kind).length]),
  );
  const registry = JSON.parse(
    readFileSync('tools/test-system-v2/architecture-review-registry.json', 'utf8'),
  );
  const collisions = registry.reviews.filter((entry) => deleted.includes(entry.path));
  const ledger = JSON.parse(readFileSync('tools/test-system-v2/pr602-file-reviews.json', 'utf8'));
  if (ledger.version !== 1 || ledger.baseRef !== BASE || ledger.proposalRef !== PROPOSAL) {
    throw new Error('PR #602 per-file review ledger has the wrong baseline');
  }
  const reviewPaths = new Set();
  for (const entry of ledger.reviews) {
    if (
      reviewPaths.has(entry.path) ||
      !deleted.includes(entry.path) ||
      !['full-file', 'representative-assertions'].includes(entry.reviewScope) ||
      ![
        'retain-until-equivalent',
        'replace-guard-before-retire',
        'manual-artifact-not-regression',
      ].includes(entry.decision) ||
      !entry.behavior?.trim() ||
      !entry.replacementAssessment?.trim() ||
      !entry.assertionEvidence?.every((item) => item.trim()) ||
      !Number.isInteger(entry.verifiedCaseCount) ||
      entry.verifiedCaseCount < 0 ||
      entry.verifiedRuntime !== entry.verifiedCaseCount > 0
    ) {
      throw new Error('Invalid or duplicated per-file review: ' + entry.path);
    }
    reviewPaths.add(entry.path);
    const currentHash = createHash('sha256').update(source(BASE, entry.path)).digest('hex');
    if (currentHash !== entry.sourceSha256)
      throw new Error('Stale PR #602 per-file review: ' + entry.path);
  }
  return {
    before,
    candidate,
    retired,
    counts,
    collisions,
    ledger,
    primaryReviewCount: registry.reviews.length,
  };
}
function render(result) {
  const { before, candidate, retired, counts, collisions, ledger } = result;
  const reviewByPath = new Map(ledger.reviews.map((entry) => [entry.path, entry]));
  const unreviewed = retired.filter((row) => !reviewByPath.has(row.file));
  const authRow = (lane) => [
    lane,
    before.byLane[lane].specs,
    before.byLane[lane].cases,
    before.byLane[lane].directUiFiles,
    candidate.byLane[lane].directUiFiles,
    candidate.byLane[lane].directApiFiles,
    candidate.byLane[lane].indirectUiFiles,
    before.byLane[lane].beforeEachUiCases,
    candidate.byLane[lane].beforeEachUiCases,
    candidate.byLane[lane].beforeEachApiCases,
  ];
  const runtime = retired.filter((e) => e.category === 'mixed-runtime-behavior');
  const guarded = retired.filter((e) => e.category === 'path-or-schema-invariant');
  const lines = [
    '# MemoFlow T2 逐文件审查：E2E 前置条件与 PR #602 退休证据',
    '',
    '> 本文件是测试架构阶段的审查结论，不会修改业务测试或合并 PR。静态分析不能替代每个删除目标的行为等价与真实执行证明。',
    '> PR 快照：' +
      codePath(BASE) +
      ' → ' +
      codePath(PROPOSAL) +
      '；主线 T1/T2 当前仍以 88d452338 为测试分类基线。快照不是未来 PR 版本。',
    '',
    '## 一、已经确认的结果',
    '',
    '- **E2E Fixture 漏审属实**：常规已登录业务测试在 beforeEach 中重复通过浏览器注册、验证邮箱、登录。认证本身不是这些测试的业务目标。',
    '- **PR #602 并未彻底消除前置开销**：已迁移文件使用 API 注册/邮箱验证/API 登录，但仍然按用例建号；共享 Goal Workflow Fixture 等仍经 UI 注册。',
    '- **PR 删除清单存在真实回归风险**：提议删除 ' +
      retired.length +
      ' 个文件（其中 1 个为论文截图流程），包含 ' +
      counts['mixed-runtime-behavior'] +
      ' 个实际行为断言文件和 ' +
      counts['path-or-schema-invariant'] +
      ' 个文件存在性/Schema 约束文件，不能统称为纯字符串锁。',
    '- T2 本地审查索引中有 ' +
      collisions.length +
      ' 个带 SHA-256 记录的文件出现在 PR 删除清单；合并后需先更新决策与 Inventory，否则治理检查会失败。',
    '- **旧测试现场验收：' +
      ledger.reviews.filter((entry) => entry.verifiedRuntime).length +
      ' 个文件、' +
      ledger.reviews.reduce((sum, entry) => sum + entry.verifiedCaseCount, 0) +
      ' 个 Vitest 用例通过**。这只能证明旧测试当前可执行，不证明 PR 的替代覆盖等价。',
    '- **本批按文件人工核验 ' +
      ledger.reviews.length +
      ' / ' +
      retired.length +
      ' 个删除候选**（其中 ' +
      ledger.reviews.filter((entry) => entry.reviewScope === 'full-file').length +
      ' 项为整文件阅读，其他仅代表性断言审查）；其余 ' +
      unreviewed.length +
      ' 个没有人工判定，仍待处理。',
    '- **旧 Main 全部 Primary 测试的代表性断言复核累计 ' +
      collisions.length +
      ' 个拟删文件，以及另 ' +
      (result.primaryReviewCount - collisions.length) +
      ' 个保留测试；合计 ' +
      result.primaryReviewCount +
      ' / 1,336 个**。其余文件仍须逐个处理；此处并非 T2 全部验收。',
    '- **不批准当前 PR #602 的整包退休**：每个文件已记录保护目标，但替代测试行为等价性与候选 PR 的实际 CI 回执仍需证明。',
    '',
    '## 二、各 Web E2E 车道认证前置开销',
    '',
    '统计的是源码里直接调用与 beforeEach 测试声明，**不是准确的运行次数或耗时**。Fixture 里的间接调用单列，不要重复相加。',
    '',
    table(
      [
        '车道',
        '文件',
        '测试声明',
        '旧 UI 文件',
        'PR 后 UI 文件',
        'PR 后 API 文件',
        'PR 后间接 UI 文件',
        '旧每例 UI 声明',
        'PR 后每例 UI 声明',
        'PR 后每例 API 声明',
      ],
      ['required-flow', 'nightly-audit', 'local-docker'].map(authRow),
    ),
    '',
    '- 登录态与账号生命周期尚未实现统一的 Worker 作用域 Session 复用，且不存在通用的后端每 Test 数据隔离 Fixture。',
    '- Goal Workflow 的 ' +
      codePath('goal-workflow.fixture.ts') +
      (candidate.indirectGoalUi ? ' 仍经旧 UI 注册。' : ' 已脱离旧 UI 注册。'),
    '- Account Settings 的 ' +
      codePath('account-settings.helpers.ts') +
      (candidate.indirectAccountUi ? ' 仍经旧 UI 注册。' : ' 已脱离旧 UI 注册。'),
    '- Auth 专项测试应完整保留 UI 注册/登录验证；不能为了加速而让 Auth 测试使用绕过 UI 的 Fixture。',
    '',
    '### T2 明确的 Fixture 生命周期规范（交 T4 实施）',
    '',
    table(
      ['场景', '账号与会话前置条件', '业务数据隔离'],
      [
        [
          '普通已登录业务 E2E',
          '测试环境 API 预建号、Worker 独立登录快照；普通用例直接启动已登录 Context',
          '每用例独立种子、所有权 ID、清理或数据库回滚',
        ],
        [
          'Authentication 专项',
          '被测的注册/验证/登录/登出必须真的从 UI 执行',
          '每次新建完整测试身份',
        ],
        [
          '跨身份/多会话测试',
          '每个 actor 独立账号与快照；必要步骤显式 UI',
          '跨角色分别隔离数据库与离线同步队列',
        ],
        [
          '密码重置/退出/切换身份',
          '只保留被测认证行为；其他准备走 API',
          '每个测试独立账号和重置后状态',
        ],
        [
          'Local Docker/安装版',
          '先验证支持测试邮件捕获与必要安全隔离，再配置专用 Fixture',
          '本地数据/Profile 独立，不假定 cloud cookie 可复用',
        ],
      ],
    ),
    '',
    '新 Fixture 的不可变条件：Playwright BrowserContext 按测试隔离，Web Origin 与 Better Auth Cookie 域匹配；',
    '认证快照不得提交 Git 或作为公开 CI Artifact；不同测试不得共享未清理的业务数据。',
    '',
    '## 三、PR #602 删除候选分类（不是直接删除批准）',
    '',
    table(
      ['静态分组', '文件数', '处理决定'],
      [
        [
          '真实生产函数行为断言',
          counts['mixed-runtime-behavior'],
          '需对照真实调用与替代行为用例，不得把整文件当文本锁删',
        ],
        [
          '源文件/Schema/路径是否存在检查',
          counts['path-or-schema-invariant'],
          '需明确安全、结构与文档链接约束是否有替代门禁',
        ],
        [
          '源码字符串测试候选',
          counts['source-text-candidate'],
          'T4 可逐项退休；静态相似不等于行为证明',
        ],
        [
          '手工截图入口',
          counts['screenshot-artifact'],
          '可从回归集合移出，但需查清资产生成/消费方',
        ],
      ],
    ),
    '',
    '### A. 不能作为纯源码锁整文件删除的 ' + runtime.length + ' 个文件',
    '',
    table(
      ['文件', '直接调用的生产函数', 'T2 判断'],
      runtime.map((row) => [
        codePath(row.file),
        [
          ...row.behaviorInvocations,
          ...row.dynamicRuntimeImports.map((x) => 'dynamic import ' + x),
        ].join(', '),
        row.file.includes('/parse-json-like-string-')
          ? '现存 crud-normalization.spec.ts 覆盖正常与畸形 JSON；非 JSON 文本分支及等价执行证据仍要比对。'
          : row.file.includes('/dual-registry.surface')
            ? 'toStringArray、toNumberArray、toChunkArray、scoreIndexedResource 的直接行为断言未发现完整替代；应保留或迁移到行为测试。'
            : '没有证明直接的行为等价替代，必须保留或迁移测试。',
      ]),
    ),
    '',
    '### B. 重要的文件存在性/安全结构约束',
    '',
    '- ' +
      codePath(
        'packages/contracts/src/modules/setting/preferences/product-module-index-paths.surface.spec.ts',
      ) +
      '：遍历 Module Index 文档链接并验证文件实际存在；删除时应建立等价文档链接校验。',
    '- ' +
      codePath(
        'packages/account/src/server/infrastructure/adapters/prisma/__tests__/account-auth-email-retirement.surface.spec.ts',
      ) +
      '：负向检查 Prisma/PowerSync Schema 不出现已退役 Account auth-email 影子字段及旧迁移脚本；须确认等价安全约束。',
    '- 其余 ' +
      Math.max(0, guarded.length - 2) +
      ' 个包含 existsSync 约束的文件也需按其目标结构逐项审查；不能据文件名带 surface 就认为无功能价值。',
    '',
    '### C. 已有逐文件人工处置证据（由 Git Source SHA-256 验证）',
    '',
    '下表每个文件都单独审查了测试目标与关键断言。**未运行测试不代表测试无效**；运行通过也不代替行为等价性证明。',
    '',
    table(
      ['文件', '检查范围', '执行证据', '处理决定', '关键断言证据', '退休前缺什么'],
      ledger.reviews.map((entry) => [
        codePath(entry.path),
        entry.reviewScope,
        entry.verifiedRuntime ? '本轮 Vitest 已通过' : '本轮未运行',
        entry.decision,
        entry.assertionEvidence.join('; '),
        entry.replacementAssessment,
      ]),
    ),
    '',
    '### D. 尚无人工审查决定的 PR 文件',
    '',
    unreviewed.length
      ? table(
          ['文件', '静态提示'],
          unreviewed.map((row) => [codePath(row.file), row.category]),
        )
      : '本次 PR #602 删除候选中的 63 个文件均已有独立的代表性断言或整文件复核记录；不等于已批准退休。',
    '',
    '## 四、T2 审查元数据必须与 PR 同步',
    '',
    '其中 ' +
      collisions.length +
      ' 个拟删文件已纳入旧 Main T2 源码指纹注册表。具体文件、保护行为与处置证据见上表，删除后这些记录会过期；合并前必须转化为替代覆盖或安全退休决策。',
    '',
    'T4 合并 PR 前必须把这些决策记录迁移为已退休证据，重生成 Inventory、Source Role、Risk Matrix 并复跑治理目标。否则不能安全合并。',
    '',
    '## 五、T2 验收/责任边界',
    '',
    '- T2 已完成：原 1,336 测试静态归属审查、其中 ' +
      result.primaryReviewCount +
      ' 份代表性语义复核、PR 63 个删除候选逐文件判断、E2E Fixture 前置条件漏审修正。其余 ' +
      (1336 - result.primaryReviewCount) +
      ' 份仍未完成人工语义抽样，更不代表逐断言全部验证。',
    '- T2 不包含：修改/合并 PR #602、删除测试、改写 E2E Fixture、迁移 Storybook/Browser Mode 或调整 CI Workflow。这些分别属于 T3/T4/T5。',
    '- 没有经证据证明等价的旧测试不得退休；候选 PR 可分批验证并修复，不能先一次删除再观察绿灯。',
    '',
    '从仓库根目录复现这份快照报告（不触发 pnpm 自动依赖安装）：',
    '',
    '    node tools/test-system-v2/t2-review.mjs --write-report',
    '',
  ];
  return lines.join('\n');
}
const args = process.argv.slice(2);
if (
  args.length > 1 ||
  (args.length && !['--report', '--summary', '--write-report'].includes(args[0]))
)
  throw new Error(
    'Usage: node tools/test-system-v2/t2-review.mjs [--report|--summary|--write-report]',
  );
const evidence = collectEvidence();
if (args[0] === '--summary') {
  console.log(
    JSON.stringify(
      {
        counts: evidence.counts,
        authBefore: evidence.before.byLane,
        authProposal: evidence.candidate.byLane,
        reviewCollisions: evidence.collisions.length,
        reviewedPrimarySamples: evidence.primaryReviewCount,
        reviewedDeletionFiles: evidence.ledger.reviews.length,
        fullyReadFiles: evidence.ledger.reviews.filter((entry) => entry.reviewScope === 'full-file')
          .length,
        representativeReviewFiles: evidence.ledger.reviews.filter(
          (entry) => entry.reviewScope === 'representative-assertions',
        ).length,
        remainingUnreviewedDeletionFiles: evidence.retired.length - evidence.ledger.reviews.length,
        testedDeletionFiles: evidence.ledger.reviews.filter((entry) => entry.verifiedRuntime)
          .length,
        testedCases: evidence.ledger.reviews.reduce(
          (sum, entry) => sum + entry.verifiedCaseCount,
          0,
        ),
      },
      null,
      2,
    ),
  );
} else {
  const report = render(evidence);
  if (args[0] === '--write-report') {
    const dest = path.resolve(process.cwd(), 'docs/test/test-architecture-t2-decision.md');
    const config = (await prettier.resolveConfig(dest)) ?? {};
    await fs.writeFile(dest, await prettier.format(report, { ...config, filepath: dest }));
    console.log('T2 review: docs/test/test-architecture-t2-decision.md');
    console.log(
      'PR deletions=' +
        evidence.retired.length +
        '; mixed runtime=' +
        evidence.counts['mixed-runtime-behavior'] +
        '; path/schema=' +
        evidence.counts['path-or-schema-invariant'] +
        '; metadata collisions=' +
        evidence.collisions.length,
    );
  } else console.log(report);
}
