import { FINDINGS } from './architecture-batch-audit.mjs';

function escapeCell(v) {
  return String(v ?? '')
    .replace(/\|/gu, '\\|')
    .replace(/\r?\n/gu, ' ')
    .trim();
}
function shortPath(file) {
  return file.length <= 95 ? file : '…/' + file.slice(-93);
}
function mdTable(head, rows) {
  return (
    '| ' +
    head.join(' | ') +
    ' |\n|' +
    head.map(() => '---').join('|') +
    '|\n' +
    rows.map((row) => '| ' + row.map(escapeCell).join(' | ') + ' |').join('\n')
  );
}
const severity = { high: 0, medium: 1, low: 2 };
const riskWeight = { P0: 100, P1: 60, P2: 20 };

function riskForFile(file, risks) {
  let max = 0;
  for (const r of risks)
    if (r.evidence.some((item) => item.path === file.path))
      max = Math.max(max, riskWeight[r.severity] || 0);
  return max;
}
function sortFiles(files, risks) {
  return [...files].sort(
    (a, b) =>
      riskForFile(b, risks) - riskForFile(a, risks) ||
      b.priority - a.priority ||
      a.path.localeCompare(b.path),
  );
}
export function renderFileTable(
  audit,
  { finding = null, type = null, role = null, review = null, limit = 30 } = {},
) {
  let files = audit.files.filter(
    (f) =>
      (!finding || f.findings.some((item) => item.id === finding)) &&
      (!type || f.testType === type) &&
      (!role || f.testRole === role) &&
      (!review || (f.reviewStatus ?? 'pending') === review),
  );
  files = sortFiles(files, audit.risks);
  const subset = files.slice(0, limit);
  return [
    '# MemoFlow 测试审查清单',
    '',
    '匹配文件：**' +
      files.length +
      '**，显示前 **' +
      subset.length +
      '**。这是静态排查队列，不是删除清单。',
    '',
    mdTable(
      ['测试文件', '分类', '声明数', '发现', '处理'],
      subset.map((f) => [
        shortPath(f.path),
        f.testType ?? f.testRole,
        f.caseDeclarations + (f.factoryCaseCalls ? ' (另动态 ' + f.factoryCaseCalls + ')' : ''),
        f.findings
          .map((item) => item.id)
          .join('、')
          .slice(0, 64) || '未触发静态异常信号',
        f.reviewStatus === 'reviewed-sample'
          ? '已抽样审阅：' + (f.reviewDecision ?? 'retain')
          : '自动扫描：待复核',
      ]),
    ),
    '',
    '针对某个文件的全部源码结论请使用带 --json 的机器接口或查看 T2 审查注册表；本表刻意省略冗长对象。',
    '',
  ].join('\n');
}
const hotCategories = [
  'focused-test',
  'runtime-conditional-skip',
  'unbound-specialized-e2e',
  'no-direct-assertion',
  'browser-interaction-simulated',
  'source-role-ambiguity',
  'unverified-integration-db',
  'factory-generated-cases',
];
function findingTable(audit, id, limit = 8) {
  const matches = sortFiles(
    audit.files.filter((f) => f.findings.some((x) => x.id === id)),
    audit.risks,
  );
  if (!matches.length) return '';
  return [
    '### ' + FINDINGS[id][1] + '（' + matches.length + ' 个文件）',
    '',
    mdTable(
      ['文件', '测试声明', '排查原因'],
      matches
        .slice(0, limit)
        .map((f) => [
          shortPath(f.path),
          f.caseDeclarations + (f.factoryCaseCalls ? ' + ' + f.factoryCaseCalls + ' 动态' : ''),
          (f.findings.find((x) => x.id === id)?.reason ?? '').slice(0, 90),
        ]),
    ),
    '',
    matches.length > limit
      ? '只展示最靠前的 ' + limit + ' 条；使用文末的筛选命令可看完整明细。'
      : '',
    '',
  ].join('\n');
}
export function renderHumanReport(audit, { generatedAt = '2026-10-24' } = {}) {
  const s = audit.summary;
  const typeRows = Object.entries(s.types).map(([k, v]) => [
    k,
    v,
    audit.files.filter((f) => f.testType === k && f.reviewStatus === 'reviewed-sample').length,
    audit.files.filter((f) => f.testType === k).filter((f) => f.findings.length > 0).length,
  ]);
  typeRows.push(
    ['Governance (role)', s.roles.governance, 0, 0],
    [
      'Source constraint (role)',
      s.roles['source-constraint'],
      audit.files.filter(
        (f) => f.testRole === 'source-constraint' && f.reviewStatus === 'reviewed-sample',
      ).length,
      audit.files.filter((f) => f.testRole === 'source-constraint' && f.findings.length > 0).length,
    ],
  );
  const findingRows = Object.entries(audit.issueCounts)
    .filter(([, v]) => v.files > 0)
    .sort((a, b) => severity[a[1].severity] - severity[b[1].severity] || b[1].files - a[1].files)
    .map(([k, v]) => [k, v.severity, v.files, v.title]);
  const riskRows = audit.risks.map((r) => [
    r.severity + ' ' + r.id,
    r.evidence.length + ' 项',
    r.missingExpectedTypes.length ||
    r.missingExpectedEnvironments.length ||
    r.missingDesiredPhases.length
      ? [
          r.missingExpectedTypes.length ? 'Type' : '',
          r.missingExpectedEnvironments.length ? 'Env' : '',
          r.missingDesiredPhases.length ? 'Phase' : '',
        ]
          .filter(Boolean)
          .join('+') + ' 待完善'
      : '已映射（非执行证明）',
    r.knownGaps[0]?.slice(0, 90) || '需进一步核实',
  ]);
  const decisions = [
    [
      '保留',
      '大部分既有 Unit/Contract/Integration/E2E',
      '不能因为相同组件或标题就认定重复；现有跨层行为不同',
    ],
    [
      '补测',
      '周期选择器键盘行为；跨端同步专项执行；真实迁移升级恢复',
      '明确新的断言与 Runner 后补上覆盖',
    ],
    [
      '迁移候选',
      audit.issueCounts['browser-interaction-simulated'].files +
        ' 份 Simulated DOM 键盘/焦点信号候选',
      '只迁移真实浏览器不可替代的行为；数量是候选，不是强制迁移目标',
    ],
    [
      '审查源码断言',
      s.roles['source-constraint'] + ' 份 Source-constraint（部分路径间接构造）',
      '把脆弱字符串锁优先转换为可靠的 AST/接口验证，不提前删除',
    ],
    ['安全删除', '0 份具备完整替代执行证据', '等价断言 + 同条件运行 + CI 证据齐备之前不批准退休'],
  ];
  const items = [
    '# MemoFlow T2：测试架构全量静态审查报告',
    '',
    '生成日期：' + generatedAt + '；源码基线 main@88d452338（本地未提交 T1/T2 变更）。',
    '',
    '> 这是可供人阅读的审查结果。**全量静态检查**和**逐条人工断言审查**是两种不同的完成标准。',
    '> 静态信号属于排查候选，不能直接判定测试无效、质量通过或可以删除。',
    '',
    '## 一、结论',
    '',
    '- **全量自动扫描完成：' +
      s.scannedFiles +
      ' / 1,336 个文件。** 抽取约 **' +
      s.caseDeclarations +
      ' 个标准测试声明**' +
      (s.factoryCaseCalls ? '，另 ' + s.factoryCaseCalls + ' 个测试工厂调用' : '') +
      '（参数化声明并非实际运行用例数）。',
    '- **样本级人工核对：' +
      s.manuallyReviewedSamples +
      ' 个文件**，其他 ' +
      s.automatedOnly +
      ' 个仅完成 AST / 规则分析。这不等于全部文件的断言质量已经人工确认。',
    '- **' +
      s.flaggedFiles +
      ' 个文件出现至少一项待核实的静态线索**。线索包含条件跳过、在 helper 中断言、模拟浏览器、' +
      '间接源码读取和 CI 车道未确认，不等于发现了 ' +
      s.flaggedFiles +
      ' 个缺陷。',
    '- **已获得行为等价与真实执行证据、可以退休的测试：0 个。**',
    '- 需要优先解决的是“误分类导致误删”和“业务高风险跨边界用例缺少真实门禁”，而不是压缩测试文件数量。',
    '',
    '## 二、架构统计',
    '',
    mdTable(['主类型或辅助职责', '文件数', '人工抽样', '命中静态线索'], typeRows),
    '',
    '注意：Smoke 是 Integration 的一种执行职责，Source-constraint 与 Governance 是辅助 Role；不是所有行互斥可加总。',
    '',
    '## 三、自动审查发现（仅排查线索）',
    '',
    mdTable(['标识', '优先度', '涉及文件', '解释'], findingRows),
    '',
    '**怎么看？** 重点关注高优先级和 P0 业务风险；多个信号可能来自同一个文件，文件数不可相加。',
    '无直接 expect 并不意味着没有断言：例如同步 E2E 调用的 waitForGoalVisible 在 helper 中断言。',
    '对 11 份带条件 skip 的文件检查调用位置：10 份是 Desktop/Windows 或操作员授权的专项场景，另 1 份 Web Provider 需要显式提供真实 Endpoint/Key。',
    '这些具有明确的跳过前提，不应当被当成坏测试删除；仍需核对所需平台上的实际执行收据。',
    '',
    '## 四、优先处理的审查线索（具体文件）',
    '',
  ];
  for (const id of hotCategories) {
    const content = findingTable(audit, id);
    if (content) items.push(content);
  }
  items.push(
    '## 五、关键业务风险矩阵（11 项）',
    '',
    mdTable(['业务风险', '已映射文件', '待核实', '业务影响/缺口摘录'], riskRows),
    '',
    '这是“测试架构风险证据”，不是“11 个产品 Bug”。没有实际 PR/Main/Nightly/Release 回执的地方仍需验证。',
    '',
    '## 六、处理决策：哪些留，哪些改，哪些删？',
    '',
    mdTable(['决策', '对象', '原因／后续条件'], decisions),
    '',
    '已有人工复核的 **' +
      s.correctedPrimaryClassifications +
      ' 项主分类纠错** 保留于 architecture-review-registry.json，',
    '特别是把运行时 SQLite/LibSQL 文件读取错分成源码静态检查的问题；分类修正不会改变现有 Suite/CI 执行。',
    '',
    '## 七、工程下一步',
    '',
    '1. 优先核实 Windows Electron 和 Specialized Sync E2E 的实际 Runner 与强制门禁，避免假绿灯。',
    '2. 为 Task 周期选择器补真实键盘交互；将 GoalDialog/TaskPlanForm 的浏览器交互和模拟 DOM 规则分层。',
    '3. 对“零直接断言”候选逐条检查 helper 或期待异常；只有确实不验证行为的用例才重写。',
    '4. 审查 Source-constraint 的误报和源码文本锁，保留真正防止安全/架构回退的规则。',
    '5. 核对所有 P0 数据升级与 Agent 实际跨边界场景，再以等价证明决定是否安全退休旧测试。',
    '',
    '## 八、阅读与查询',
    '',
    '以下命令从项目根目录执行：',
    '',
    '~~~bash',
    '# 生成这份人类可读的报告',
    'node tools/test-system-v2/batch-audit.mjs --write-report',
    '',
    '# 直接在终端输出简洁 Markdown 总览',
    'node tools/test-system-v2/batch-audit.mjs --report',
    '',
    '# 输出最优先的 30 个文件（Markdown 表格，不是 JSON）',
    'node tools/test-system-v2/batch-audit.mjs --table --limit 30',
    '',
    '# 按标志筛选',
    'node tools/test-system-v2/batch-audit.mjs --table --finding no-direct-assertion',
    '',
    '# 查询组件测试清单',
    'node tools/test-system-v2/batch-audit.mjs --table --type component',
    '~~~',
    '',
    '## 九、证据边界',
    '',
    '- 已完成所有文件可重复 AST 扫描、类型和辅助 Role 分组、质量线索采集、主要 CI 阶段绑定候选映射。',
    '- 已对 ' +
      s.manuallyReviewedSamples +
      ' 份测试的代表性断言进行源码核对，但 **' +
      s.automatedOnly +
      ' 个尚未全量人工等价审查**。',
    '- 本报告没有执行全量 E2E、全量真实数据库迁移、真实外部模型评测或完整发布升级路径。',
    '- 静态审查不会自动修改测试、增删 Runner 或放宽 CI 门禁；所有“退休”必须有可追溯替代证据。',
    '',
  );
  return items.join('\n').replace(/\n{4,}/gu, '\n\n') + '\n';
}
