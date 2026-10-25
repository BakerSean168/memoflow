const TITLES = {
  'needs-gate-decision': 'CI/Nightly 与平台执行责任',
  'execution-prerequisite': 'Windows 或真实 Provider 执行条件',
  'assertion-helper-review': '委托断言与异常路径',
  'source-role-recheck': '源码读取与运行态数据误分类',
  'browser-behavior-review': '模拟 DOM 的焦点与键盘用例',
  'database-dependency-review': 'Integration 中真实数据库依赖',
  'test-factory': '工厂生成测试',
};
const SHORT_RECOMMENDATIONS = {
  'needs-gate-decision': '核查执行入口与 Run receipt；对 P0 流程决定独立验收门禁。',
  'execution-prerequisite': '保留条件跳过，证实有满足前提的运行器或明确人工验收。',
  'assertion-helper-review': '沿函数调用核实内部断言或失败条件，不按 expect 数量删除。',
  'source-role-recheck': '核实读入的是源码还是运行数据；纠错后保留原执行入口。',
  'browser-behavior-review': '只迁移实际需要浏览器语义的焦点与键盘验证。',
  'database-dependency-review': '分辨真正的 PostgreSQL、SQLite 和 Mock，补运行证据。',
  'test-factory': '测试工厂计数单独统计；不得判为无测试。',
};
function clean(s, n = 160) {
  return String(s ?? '')
    .replace(/\r?\n/gu, ' ')
    .replace(/\|/gu, '/')
    .slice(0, n);
}
function table(headers, rows) {
  return (
    '| ' +
    headers.join(' | ') +
    ' |\n| ' +
    headers.map(() => '---').join(' | ') +
    ' |\n' +
    rows.map((row) => '| ' + row.map((v) => clean(v, 210)).join(' | ') + ' |').join('\n')
  );
}
const link = (file) => '[' + file.split('/').at(-1) + '](../../' + file + ')';
export function renderFocusedReport(triage, architecture) {
  const s = triage.summary;
  const releaseRows = architecture.entries.filter(
    (entry) => entry.executionPhases.release.status === 'conditional',
  );
  const browserPilots = [
    [
      'packages/app-vue/src/modules/task/components/TaskPlanForm/widgets/selectors-accessibility.spec.ts',
      '补周期选择器 Tab / Enter / Space 的真实键盘选择流程。',
    ],
    [
      'packages/app-vue/src/modules/goal/components/dialogs/GoalDialog.spec.ts',
      '已有 Storybook play；补充真实焦点和 Overlay 边界，不重复 Web CRUD。',
    ],
    [
      'packages/app-vue/src/shared/components/ProductDialogShell.spec.ts',
      '真实浏览器聚焦、Escape 关闭和焦点返回。',
    ],
    [
      'packages/app-vue/src/shared/components/ProductDateTimePicker.spec.ts',
      '真实浏览器箭头键调整与弹层焦点。',
    ],
    [
      'packages/app-vue/src/modules/ai/components/AIComposerControls.spec.ts',
      '模型列表真实键盘导航、禁用项与焦点。',
    ],
  ];
  const browserSignals = triage.entries.filter(
    (entry) => entry.disposition === 'browser-behavior-review',
  );
  const flaggedPilots = browserPilots.filter(([file]) =>
    browserSignals.some((entry) => entry.path === file),
  ).length;
  const rows = Object.entries(s.grouped)
    .filter(([, count]) => count)
    .map(([id, count]) => [TITLES[id], count, SHORT_RECOMMENDATIONS[id]]);
  const riskRows = triage.entries
    .filter((e) => e.riskIds.some((id) => id.startsWith('P0:')))
    .map((e) => [link(e.path), e.riskIds.join(', '), e.findings.join(', '), e.evidence]);
  const corrected = architecture.entries
    .filter(
      (e) =>
        e.reviewStatus === 'reviewed-sample' &&
        e.inferredBeforeReview &&
        (e.inferredBeforeReview.testType !== e.testType ||
          e.inferredBeforeReview.testRole !== e.testRole),
    )
    .map((e) => [
      link(e.path),
      e.inferredBeforeReview.testType ?? e.inferredBeforeReview.testRole,
      e.testType ?? e.testRole,
      e.reviewedReason,
    ]);
  const lines = [
    '# MemoFlow T2：重点复核与工程处理决策',
    '',
    '> 本报告只描述旧 WSL main@88d452338 的静态风险信号，当前信号已按新 T2 范围处置。',
    '> 最新验收与 T3/T4/T5 交接见 [T2 收尾与定向审查结论](./test-architecture-t2-closeout.md)。',
    '> 认证 Fixture 和 PR #602 退休约束见 [T2 专项审查](./test-architecture-t2-decision.md)。',
    '',
    '基线：2026-10-24 WSL main@88d452338（本地含尚未提交的 T1/T2 改动）。',
    '',
    '> 方法：对全量 1,336 个测试扫描后的异常文件再次读取 AST、关联业务风险与现有 CI collector。',
    '> 本文件是**按证据组织的排查结果**，不是对全部 1,336 个测试逐条断言的人工认证，也不是已批准的删除清单。',
    '',
    '## 一、可以直接采用的结论',
    '',
    '- **源文件扫描：' +
      s.scannedPrimary +
      ' / 1,336；仍保留的自动异常信号：' +
      s.flaggedPrimary +
      ' 个文件**。上一轮有 174 个候选；减少源于规则修正及有指纹的人工证据，不等于全部减少项逐文件完成了人工复核。',
    '- 已阅读代表性断言并登记源码指纹的主要测试文件：**' +
      s.reviewedByHumanSample +
      ' 个**。剩余条目仍是程序分析与分组，不应宣称已人工审定。',
    '- **已关闭 11 个合理的条件 skip 静态警报**：其中 10 个为 Desktop Windows 专项，1 个为真实 Provider 密钥准入；测试仍保留按条件跳过的代码。',
    '- **已确认 Helper 内的断言、部分故意抛错和测试工厂注册均有具体证据**；未发现可以据此直接删除的测试。',
    '- **经等价断言+运行环境+执行凭证证明可以安全退休的测试：0 个**。本轮没有修改旧测试、执行器或 CI 门禁。',
    '',
    '## 二、聚类结果和下一步',
    '',
    table(['处理类别', '文件数（互斥）', '处理原则'], rows),
    '',
    '每个文件只列在一个主要处理类别，但可同时命中多个静态线索。上表合计 ' +
      s.flaggedPrimary +
      ' 个文件。',
    '',
    '其中 ' +
      browserSignals.length +
      ' 个模拟 DOM 信号不是都需要迁移：**' +
      flaggedPilots +
      ' 个纳入优先 Browser Mode 试点，其他 ' +
      (browserSignals.length - flaggedPilots) +
      ' 个原模拟 DOM 测试暂时保留、无需在 T2 立即变更**。此外单独补足 TaskPlanForm 的键盘行为（它并未触发本轮静态警报）。',
    '',
    '## 三、与 P0 业务风险关联的重点记录',
    '',
    riskRows.length
      ? table(['文件', '风险', '线索', '具体情况'], riskRows)
      : '当前规则没有将候选直接关联到 P0 风险证据文件；这不能证明安全。',
    '',
    '**Release 纠错：Windows Workspace IPC 不是完全没有 CI。** release-assets.yml 已调用 desktop-update-e2e.yml；该 Workflow 在 windows-latest 上执行真实安装版 E2E，以下 6 个测试有 release=conditional 的精确入口。',
    '',
    table(
      ['Release 已声明执行的测试', 'Release 状态'],
      releaseRows.map((entry) => [
        link(entry.path),
        entry.executionPhases.release.status + '（仍需 GitHub Run receipt）',
      ]),
    ),
    '',
    'Windows IPC 仍需确认该 release SHA 的实际成功结果，不能仅凭 Workflow YAML 声称测试已通过。PR/Nightly 缺绑定不等于整个 CI 缺少这项验证。',
    '',
    '## 四、已经核实并关闭的误报（不是删除测试）',
    '',
    table(
      ['原警报', '源码证据', '处理结论'],
      [
        [
          '无直接 expect',
          'Goal Sync 的 helpers/goal.ts 使用 expect.poll；schema 校验 Helper 内有 expect/throw；AppShell 故意在 it.fails 中抛错。',
          '保留测试，关闭没有断言的错误判断。',
        ],
        [
          '间接源码路径',
          'PowerSync/schema、Prisma Schema、产品文档等通过 read(name)/resolve 读取并断言。',
          '保留真正的架构约束，避免被误分类为运行态 IO。',
        ],
        [
          '数据库依赖推断',
          '识别 getPrisma/共享 integration-helpers、Prisma client、Redis 容器与 InMemory Adapter。',
          '准确记录源码配置证据；未宣称数据库执行通过。',
        ],
        [
          'Windows/Provider skip',
          'process.platform !== win32 与 live Provider Endpoint/Key 准入条件。',
          '符合预期，保留测试及其平台条件。',
        ],
        [
          '工厂测试无声明',
          'Desktop Update 的 scenario(id, run) 会注册 Vitest it(id,...), 14 个场景。',
          '关闭空测试误报。',
        ],
      ],
    ),
    '',
    '## 五、具体重复测试核对：相同断言不等于可删除',
    '',
    table(
      ['发现了同样的断言', '不同入口', '处理决定'],
      [
        [
          'GoalPlanMutationAdapter 保留 owner 错误的用例',
          'apps/api/src/modules/ai/goal-plan-mutation.adapter.spec.ts 与 apps/desktop/src/main/modules/ai/goal-plan-mutation.adapter.spec.ts 分别实例化 Web/API 与 Desktop Adapter。',
          '保留两端行为；后续可抽共享参数化契约，但不得直接删除其中一端。',
        ],
        [
          'TaskPlanMutationAdapter 保留 owner 错误的用例',
          'apps/api/src/modules/ai/task-plan-mutation.adapter.spec.ts 与 apps/desktop/src/main/modules/ai/task-plan-mutation.adapter.spec.ts 测试不同运行实现。',
          '同样保留双端验证，是否复用测试数据交 T4 决定。',
        ],
      ],
    ),
    '',
    '这些是按 AST 识别到的跨文件相同断言片段，并已核对两端 Adapter 实例类型不同；不应把两份整文件视为冗余。',
    '',
    '## 六、按源码纠正的分类误报',
    '',
    table(['文件', '原分类', '纠正后', '证据和理由'], corrected),
    '',
    '语义分类纠正不会自动改变原 Unit Suite 或切换 Runner。',
    '',
    '## 七、各处理组代表性文件',
    '',
  ];
  for (const [id, count] of Object.entries(s.grouped)) {
    if (!count) continue;
    const group = triage.entries.filter((e) => e.disposition === id);
    lines.push(
      '### ' + TITLES[id] + '（' + count + '）',
      '',
      table(
        ['文件', '风险关联', '静态证据/执行归属'],
        group
          .slice(0, Math.min(count, 9))
          .map((e) => [link(e.path), e.riskIds.join(', ') || '—', e.evidence]),
      ),
      '',
      group.length > 9 ? '其余文件在末尾的完整清单。' : '',
      '',
    );
  }
  lines.push(
    '## 八、下一阶段具体动作与验收条件',
    '',
    '| 优先级 | 任务 | 验收要求 |',
    '| --- | --- | --- |',
    '| P0 | Web/Desktop 双向同步 | T5 明确 specialized E2E 真实验收的责任、触发条件与 Run receipt，不能用 SDK Mock 替代。 |',
    '| P0 | Windows Electron IPC | **已有 Release Workflow 入口**；T6 核实 GitHub Run/安装包/目标 SHA 成功回执，不重复新增 CI。 |',
    '| P1 | Task 周期选择器键盘 | T3/T4 保留 aria-pressed 断言，补 Tab/Enter/Space 真实浏览器交互。 |',
    '| P1 | Source-constraint 误分类 | 已根据源码路径修正规则，保留已证明的 Schema、密钥泄漏与架构约束。 |',
    '| P1 | Integration 真依赖 | 已追踪共享 Fixture 的数据库配置。未来如需实证，单独运行真实 PostgreSQL 测试并保存报告。 |',
    '| P2 | 委托断言 | 本轮已核实并关闭所列典型误报；后续新增测试依旧使用源码指纹防过期。 |',
    '',
    '## 九、推荐的 T3 真实浏览器试点',
    '',
    table(
      ['目标测试', '建议补充的验证'],
      browserPilots.map(([file, reason]) => [link(file), reason]),
    ),
    '',
    '剩余 Simulated DOM 测试继续保留；存在键盘/焦点代码不代表全部都必须迁移到浏览器。特别注意 TaskPlanForm 的现有 ARIA 测试本身不会因为没有触发静态警报就拥有完整键盘覆盖。',
    '',
    '## 十、完整待处理文件级索引（' + s.flaggedPrimary + ' 条，可搜索）',
    '',
    table(
      ['源码文件', '处理类别', '业务风险', '发现/证据'],
      triage.entries.map((e) => [
        link(e.path),
        TITLES[e.disposition],
        e.riskIds.join(', ') || '—',
        e.findings.join('; ') + ' — ' + e.evidence,
      ]),
    ),
    '',
    '## 十一、结论适用边界',
    '',
    '- 全量索引：' +
      s.scannedPrimary +
      ' 文件；异常队列：' +
      s.flaggedPrimary +
      ' 文件；人工代表性断言复核：' +
      s.reviewedByHumanSample +
      ' 文件，三者不可混淆。',
    '- 一些静态规则仍可能误报；不能把 not-confirmed 当作已证明 CI 漏跑。',
    '- 只有在相同运行条件下证明替代断言等价、门禁执行可信，才能申请旧测试退休。',
    '',
    '重生成命令（不触发 pnpm 自动安装）：',
    '',
    '    node tools/test-system-v2/focus-review.mjs --write-report',
    '',
  );
  return lines.join('\n');
}
