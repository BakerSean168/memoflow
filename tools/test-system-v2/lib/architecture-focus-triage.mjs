import { promises as fs } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const PRIORITY = Object.freeze({
  'needs-gate-decision': 0,
  'execution-prerequisite': 1,
  'assertion-helper-review': 2,
  'source-role-recheck': 3,
  'browser-behavior-review': 4,
  'database-dependency-review': 5,
  'test-factory': 6,
});
const LABEL = Object.freeze({
  'needs-gate-decision': '核实门禁责任',
  'execution-prerequisite': '受限执行条件',
  'assertion-helper-review': '核实委托断言',
  'source-role-recheck': '核实源文件与运行数据',
  'browser-behavior-review': '评估真实浏览器',
  'database-dependency-review': '核实真实依赖',
  'test-factory': '工厂式测试声明',
});
const IMPACT = Object.freeze({
  'needs-gate-decision':
    '现有配置不能证明 CI 自动运行。必须根据业务风险和实际运行记录决定是否应纳入门禁。',
  'execution-prerequisite': '预期的平台/凭据限制可以保留，但不得冒充全平台绿色验证。',
  'assertion-helper-review':
    '检查 helper 内断言/抛错是否确实在测试路径调用，不允许仅因没有 expect 删除。',
  'source-role-recheck': '区分业务数据的 IO 与源码/Schema 约束，必要时仅修正语义归类。',
  'browser-behavior-review': '判断模拟 DOM 是否足以验证交互，真实焦点/键盘行为可补 Browser Mode。',
  'database-dependency-review':
    '明确真 PostgreSQL/SQLite 与 Mock，不要从 Integration 名称推断数据库覆盖。',
  'test-factory': '工厂声明应计入实际运行用例，不能认作空测试。',
});
function walk(node, fn) {
  fn(node);
  ts.forEachChild(node, (n) => walk(n, fn));
}
function callee(expr) {
  if (ts.isIdentifier(expr)) return expr.text;
  if (ts.isPropertyAccessExpression(expr)) return callee(expr.expression) + '.' + expr.name.text;
  if (ts.isCallExpression(expr)) return callee(expr.expression);
  return '';
}
export function analyzeFocusedSource(source, file) {
  const ast = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    /\.(?:tsx|jsx)$/u.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const functions = new Map();
  walk(ast, (node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text && node.body)
      functions.set(node.name.text, node.body);
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
    ) {
      functions.set(node.name.text, node.initializer.body);
    }
  });
  const cases = [];
  walk(ast, (node) => {
    if (!ts.isCallExpression(node)) return;
    const name = callee(node.expression);
    if (
      !/^(?:it|test|specify)(?:\.(?:skip|only|todo|fixme|each|concurrent|serial|fails|for|runIf|skipIf))*$/u.test(
        name,
      )
    )
      return;
    if (node.arguments.length < 2) return;
    const [title, body] = node.arguments;
    if (!(ts.isStringLiteral(title) || ts.isNoSubstitutionTemplateLiteral(title))) return;
    if (!ts.isArrowFunction(body) && !ts.isFunctionExpression(body)) return;
    let direct = 0;
    const localNames = new Set(),
      otherNames = new Set();
    walk(body.body, (n) => {
      if (!ts.isCallExpression(n)) return;
      const name = callee(n.expression);
      if (/^(?:expect|assert|strictAssert)(?:\.|$)/u.test(name)) direct++;
      if (functions.has(name)) localNames.add(name);
      else if (
        !/^(?:expect|assert|strictAssert|test|it|vi)\b/u.test(name) &&
        !name.startsWith('console.') &&
        !name.startsWith('Promise.')
      )
        otherNames.add(name);
    });
    function hasHelperAssert(name, visited = new Set()) {
      if (visited.has(name) || !functions.has(name)) return false;
      visited.add(name);
      let found = false;
      walk(functions.get(name), (n) => {
        if (!ts.isCallExpression(n)) return;
        const id = callee(n.expression);
        if (/^(?:expect|assert|strictAssert)(?:\.|$)/u.test(id)) found = true;
        else if (functions.has(id) && !visited.has(id) && hasHelperAssert(id, visited))
          found = true;
      });
      return found;
    }
    cases.push({
      title: title.text,
      line: ast.getLineAndCharacterOfPosition(node.getStart()).line + 1,
      direct,
      localHelperAssertions: [...localNames].filter((name) => hasHelperAssert(name)),
      localHelperCalls: [...localNames],
      otherCalls: [...otherNames].slice(0, 5),
    });
  });
  const noDirect = cases.filter((c) => c.direct === 0);
  const trustedLocal = noDirect.filter((c) => c.localHelperAssertions.length > 0);
  const hints = [];
  function add(k, regex) {
    if (regex.test(source)) hints.push(k);
  }
  add(
    'real-db-fixture-signal',
    /\b(?:PrismaClient|pg\.Pool|pg\.Client|new Pool\s*\(|new Client\s*\(|new Database\s*\(|withTestDatabase|testDatabase|createTestDatabase|TEST_DATABASE_URL|testDb)\b/u,
  );
  add('test-db-lifecycle-signal', /\b(?:beforeAll|afterAll|beforeEach|afterEach)\b/u);
  add('mock-signal', /\b(?:vi\.mock|vi\.fn|jest\.mock|mockResolvedValue|mockImplementation)\b/u);
  add(
    'real-keyboard-dispatch-signal',
    /(?:new KeyboardEvent\s*\(|\.trigger\s*\(\s*['"]key(?:down|up)['"]|fireEvent\.keyDown|userEvent\.keyboard|\.press\s*\(\s*['"](?:Tab|Enter|Space|Escape))/u,
  );
  add('real-focus-assertion-signal', /(?:toBeFocused\s*\(|document\.activeElement|\.focus\s*\()/u);
  add('source-extension-signal', /\.(?:prisma|tsx?|jsx?|vue|sql)(?:['"\u0060]|$)/imu);
  add(
    'runtime-data-signal',
    /\b(?:vault|snapshot|\.bin\b|\.json\b|notes\/|dbPath|server\.sqlite)\b/iu,
  );
  return {
    cases,
    noDirectCases: noDirect.length,
    localHelperEvidence: trustedLocal.map((c) => ({
      title: c.title,
      line: c.line,
      helpers: c.localHelperAssertions,
    })),
    noDirectExamples: noDirect.slice(0, 3).map((c) => ({
      title: c.title,
      line: c.line,
      localHelpers: c.localHelperCalls,
      otherCalls: c.otherCalls,
    })),
    hints,
  };
}

function selectDisposition(file, entry, risks) {
  const ids = new Set(file.findings.map((f) => f.id));
  const riskIds = risks
    .filter((r) => r.evidence.some((e) => e.path === file.path))
    .map((r) => ({ id: r.id, severity: r.severity }));
  const critical = riskIds.some((r) => r.severity === 'P0');
  if (ids.has('unbound-specialized-e2e') && critical) return 'needs-gate-decision';
  if (ids.has('runtime-conditional-skip')) return 'execution-prerequisite';
  if (ids.has('unbound-specialized-e2e')) return 'needs-gate-decision';
  if (ids.has('no-direct-assertion')) return 'assertion-helper-review';
  if (ids.has('source-role-ambiguity')) return 'source-role-recheck';
  if (ids.has('browser-interaction-simulated')) return 'browser-behavior-review';
  if (ids.has('unverified-integration-db')) return 'database-dependency-review';
  return 'test-factory';
}

export async function buildFocusedTriage(root, audit, architecture) {
  const entryByPath = new Map(architecture.entries.map((e) => [e.path, e]));
  const focused = audit.files.filter((file) => file.findings.length > 0);
  const triage = await Promise.all(
    focused.map(async (file) => {
      const entry = entryByPath.get(file.path);
      if (!entry) throw new Error('No architecture entry for ' + file.path);
      const source = await fs.readFile(path.resolve(root, file.path), 'utf8');
      const details = analyzeFocusedSource(source, file.path);
      const disposition = selectDisposition(file, entry, audit.risks);
      const lane = entry.execution.e2eLane;
      const riskIds = audit.risks
        .filter((r) => r.evidence.some((e) => e.path === file.path))
        .map((r) => r.severity + ':' + r.id);
      let evidence = LABEL[disposition];
      if (disposition === 'assertion-helper-review') {
        evidence = details.localHelperEvidence.length
          ? details.localHelperEvidence.length +
            '/' +
            details.noDirectCases +
            ' 无直接断言用例调用本文件带断言的 helper'
          : '本文件 helper 的断言可达性未证实；需追踪外部调用或明确抛错';
      } else if (disposition === 'execution-prerequisite') {
        evidence = file.path.startsWith('apps/desktop/')
          ? 'Windows/Desktop 环境或人工准入条件'
          : '真实外部 Provider 显式凭据准入';
      } else if (disposition === 'needs-gate-decision') {
        evidence = 'E2E lane=' + lane + '；PR=' + file.pr + '；Nightly=' + file.nightly;
      } else if (disposition === 'source-role-recheck') {
        evidence = details.hints.includes('source-extension-signal')
          ? '有源码/Schema 路径信号，但读取路径经变量/辅助函数间接生成'
          : details.hints.includes('runtime-data-signal')
            ? '涉及 Vault/快照/数据库运行态路径，存在源约束误分类风险'
            : 'readFile 真实读取目标需源码复核';
      } else if (disposition === 'browser-behavior-review') {
        evidence =
          details.hints
            .filter((x) => x.endsWith('dispatch-signal') || x.endsWith('assertion-signal'))
            .join(' + ') || '仅文本 signal；待确认是否实际模拟交互';
      } else if (disposition === 'database-dependency-review') {
        evidence =
          details.hints.filter((x) => x.includes('db') || x === 'mock-signal').join(' + ') ||
          '未解析到明确数据库初始化信号';
      }
      return {
        path: file.path,
        domain: file.domain,
        testType: file.testType ?? file.testRole,
        findings: file.findings.map((f) => f.id),
        riskIds,
        priority: file.priority + (riskIds.some((r) => r.startsWith('P0:')) ? 100 : 0),
        disposition,
        action: IMPACT[disposition],
        evidence,
        reviewStatus: file.reviewStatus,
        existingDecision: file.reviewDecision,
        staticHints: details.hints,
        noDirectCases: details.noDirectCases,
        localHelperEvidence: details.localHelperEvidence,
        noDirectExamples: details.noDirectExamples,
        executionLane: lane,
        pr: file.pr,
        nightly: file.nightly,
      };
    }),
  );
  triage.sort(
    (a, b) =>
      PRIORITY[a.disposition] - PRIORITY[b.disposition] ||
      b.priority - a.priority ||
      a.path.localeCompare(b.path),
  );
  const groupCounts = Object.fromEntries(
    Object.entries(PRIORITY).map(([name]) => [
      name,
      triage.filter((f) => f.disposition === name).length,
    ]),
  );
  const byFinding = Object.fromEntries(
    Object.keys(audit.issueCounts).map((id) => [
      id,
      triage.filter((f) => f.findings.includes(id)).length,
    ]),
  );
  return {
    version: 1,
    scope: 'Evidence-aware issue triage of flagged primary tests; not blanket human review',
    baselineSha: architecture.sourceInventoryVersion,
    summary: {
      scannedPrimary: audit.summary.scannedFiles,
      flaggedPrimary: triage.length,
      reviewedByHumanSample: audit.summary.manuallyReviewedSamples,
      grouped: groupCounts,
      byFinding,
      withP0RiskLink: triage.filter((f) => f.riskIds.some((r) => r.startsWith('P0:'))).length,
      unapprovedRetirement: 0,
    },
    entries: triage,
  };
}
