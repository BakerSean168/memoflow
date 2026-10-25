import { promises as fs } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { analyzeFocusedSource } from './architecture-focus-triage.mjs';

export const FINDINGS = Object.freeze({
  'focused-test': ['high', '发现 only/focus，请确认没有意外跳过其他测试'],
  'disabled-test': ['medium', '存在显式 skip/todo/fixme，请确认跳过理由'],
  'runtime-conditional-skip': ['medium', '存在条件 skip（例如 Windows 专用），需确认目标 Runner'],
  'factory-generated-cases': ['low', '使用测试工厂动态注册用例；仅计到工厂调用'],
  'no-direct-assertion': ['medium', '测试未直接断言，可能委托给 helper'],
  'source-role-ambiguity': ['low', 'Source-constraint 的文件路径是间接构造，需核实是否读源码'],
  'unverified-integration-db': ['low', 'Integration 真实数据库依赖尚未核实，不应按套件推断'],
  'browser-interaction-simulated': ['low', '模拟 DOM 中验证键盘/焦点，需评估真实浏览器补测'],
  'unbound-specialized-e2e': ['medium', '专项 E2E 的 PR/Nightly 自动化入口未经证实'],
  'test-declaration-unseen': ['low', 'AST 未识别标准测试声明，可能有自定义生成器'],
  'parse-diagnostic': ['medium', '源码 AST 解析存在诊断'],
});

function callParts(expr) {
  if (ts.isIdentifier(expr)) return [expr.text];
  if (ts.isPropertyAccessExpression(expr)) return [...callParts(expr.expression), expr.name.text];
  if (ts.isCallExpression(expr)) return callParts(expr.expression);
  if (ts.isElementAccessExpression(expr)) {
    const arg = expr.argumentExpression;
    return [...callParts(expr.expression), ts.isStringLiteral(arg) ? arg.text : 'computed'];
  }
  return [];
}
function testCall(node) {
  if (!ts.isCallExpression(node)) return null;
  const parts = callParts(node.expression);
  if (!['test', 'it', 'specify'].includes(parts[0])) return null;
  if (
    parts.length > 1 &&
    ![
      'skip',
      'only',
      'todo',
      'fixme',
      'each',
      'concurrent',
      'serial',
      'fails',
      'runIf',
      'skipIf',
      'for',
    ].includes(parts[1])
  )
    return null;
  const first = node.arguments[0];
  if (
    !first ||
    !(
      ts.isStringLiteral(first) ||
      ts.isNoSubstitutionTemplateLiteral(first) ||
      ts.isTemplateExpression(first)
    )
  )
    return null;
  const name = ts.isTemplateExpression(first) ? first.head.text + '…' : first.text;
  return {
    title: name.slice(0, 120),
    mods: parts.slice(1),
    body: node.arguments.length > 1 ? node.arguments.at(-1) : null,
    line: node.getSourceFile().getLineAndCharacterOfPosition(node.getStart()).line + 1,
  };
}
function isAssertion(node) {
  if (!ts.isCallExpression(node)) return false;
  const parts = callParts(node.expression);
  return parts[0] === 'expect' || parts[0] === 'assert' || parts[0] === 'strictAssert';
}
function walk(node, cb) {
  cb(node);
  ts.forEachChild(node, (child) => walk(child, cb));
}
export function inspectTestFile(entry, source) {
  const file = entry.path;
  const kind = /\.(?:tsx|jsx)$/u.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);
  const cases = [];
  let assertions = 0,
    reads = 0,
    sourceReads = 0,
    focus = 0,
    skippedDescribe = 0,
    conditionalSkips = 0;
  const factoryNames = new Set();
  walk(parsed, (node) => {
    if (!ts.isCallExpression(node)) return;
    const parts = callParts(node.expression);
    if (isAssertion(node)) assertions++;
    const test = testCall(node);
    if (test) {
      cases.push(test);
      if (test.mods.includes('only')) focus++;
    } else if (['describe', 'test', 'it'].includes(parts[0]) && parts.includes('only')) focus++;
    if (
      (parts[0] === 'describe' || (parts[0] === 'test' && parts[1] === 'describe')) &&
      parts.includes('skip')
    )
      skippedDescribe++;
    if (['test', 'it'].includes(parts[0]) && parts.includes('skip') && !test) conditionalSkips++;
    if (parts[0] === 'scenario' && node.arguments.length && ts.isStringLiteral(node.arguments[0]))
      factoryNames.add(node.arguments[0].text);
    if (['readFile', 'readFileSync', 'readdir', 'readdirSync'].includes(parts.at(-1))) {
      reads++;
      if (
        node.arguments.some((arg) =>
          /\.(?:vue|ts|tsx|js|jsx|mjs|mts|cjs|cts)(?:'|"|$)/u.test(arg.getText(parsed)),
        )
      )
        sourceReads++;
    }
  });
  let noAssert = 0;
  const examples = [];
  for (const c of cases) {
    if (!c.body) continue;
    let count = 0;
    walk(c.body, (node) => {
      if (isAssertion(node)) count++;
    });
    if (count === 0) {
      noAssert++;
      if (examples.length < 2) examples.push(c.title);
    }
  }
  const skipped = cases.filter((c) =>
    c.mods.some((m) => ['skip', 'todo', 'fixme'].includes(m)),
  ).length;
  const findings = [];
  const add = (id, reason) => findings.push({ id, severity: FINDINGS[id][0], reason });
  if (focus) add('focused-test', focus + ' focus / only 声明');
  if (skipped || skippedDescribe)
    add('disabled-test', skipped + ' skipped/todo cases; ' + skippedDescribe + ' describe.skip');
  if (conditionalSkips)
    add('runtime-conditional-skip', conditionalSkips + ' conditionally skipped tests');
  // The quick AST pass overcounts test.each and imported helpers. Only surface
  // unresolved cases after following helpers declared in the same file.
  if (noAssert) {
    const detail = analyzeFocusedSource(source, file);
    const unresolved = detail.noDirectCases - detail.localHelperEvidence.length;
    if (unresolved > 0) {
      add(
        'no-direct-assertion',
        unresolved +
          ' unresolved helper/assertion paths (of ' +
          detail.noDirectCases +
          ' AST cases); examples: ' +
          detail.noDirectExamples
            .map((c) => c.title)
            .slice(0, 2)
            .join(' / '),
      );
    }
  }
  // Source reads may go through read(name), path.join() or a file-list helper.
  // An indirect filename is not itself an ambiguity if source/schema/doc targets
  // are explicitly referenced in the test. Avoid false positives on surface specs.
  if (
    entry.testRole === 'source-constraint' &&
    !sourceReads &&
    !/\.(?:prisma|[cm]?[jt]sx?|vue|sql|md)(?:['"\u0060]|\b)/iu.test(source)
  ) {
    add('source-role-ambiguity', reads + ' file reads without a recognized source/document target');
  }
  const databaseWiring =
    /\b(?:getPrisma|seedAccount|cleanTaskTables|disconnectPrisma|PrismaClient|createTestDatabase|pg\.Pool|pg\.Client|TEST_DATABASE_URL|TEST_DB_HOST)\b|@memoflow\/(?:database|test-utils\/setup\/(?:integration-helpers|database))|(?:\.\.\/)+__tests__\/integration-helpers|@prisma\/adapter-pg/iu.test(
      source,
    );
  if (
    entry.testType === 'integration' &&
    !entry.executionEnvironment.confirmedDependencies?.includes('database') &&
    entry.executionEnvironment.dependencyCandidates?.some((x) => x.environment === 'database') &&
    !databaseWiring
  ) {
    add(
      'unverified-integration-db',
      'No recognized real-DB fixture or Prisma wiring; verify whether integration is in-memory or Redis',
    );
  }
  if (
    entry.testType === 'component' &&
    entry.executionEnvironment.runtime === 'simulated-dom' &&
    /(?:toBeFocused\s*\(|document\.activeElement|new KeyboardEvent\s*\(|\.trigger\s*\(\s*['"]key(?:down|up)|\.dispatchEvent\s*\(\s*new KeyboardEvent|\.focus\s*\()/u.test(
      source,
    )
  )
    add('browser-interaction-simulated', 'focus or key interaction in simulated DOM');
  // Non-required reference, screenshot, local-validation and operator suites
  // are intentionally not PR/Nightly gates. Raise a gap only for canonical
  // behavior without an explicit PR, nightly or release execution binding.
  if (
    entry.testType === 'e2e' &&
    entry.execution.e2eRole === 'canonical' &&
    entry.executionPhases.pr.status === 'not-confirmed' &&
    entry.executionPhases.nightly.status === 'not-confirmed' &&
    entry.executionPhases.release.status === 'not-confirmed'
  ) {
    add(
      'unbound-specialized-e2e',
      'canonical E2E has no configured PR/Nightly/Release automated binding',
    );
  }
  if (cases.length === 0 && factoryNames.size)
    add(
      'factory-generated-cases',
      factoryNames.size + ' scenario factory calls; body reviewed via helper',
    );
  if (cases.length === 0 && !factoryNames.size)
    add('test-declaration-unseen', 'no direct it / test / specify declaration');
  if (parsed.parseDiagnostics.length)
    add('parse-diagnostic', parsed.parseDiagnostics.length + ' AST parse diagnostics');
  // Only source-hash-validated human evidence may close an AST candidate.
  // The original signal remains observable as a reviewed resolution, not a
  // silent skip. If the test changes, applySemanticReview drops the resolution.
  const resolved = (entry.resolvedFindings ?? []).filter((item) =>
    findings.some((finding) => finding.id === item.id),
  );
  const openFindings = findings.filter(
    (finding) => !resolved.some((item) => item.id === finding.id),
  );
  const priority = openFindings.reduce(
    (sum, f) => sum + (f.severity === 'high' ? 100 : f.severity === 'medium' ? 30 : 8),
    0,
  );
  return {
    path: file,
    testType: entry.testType,
    testRole: entry.testRole,
    suite: entry.primarySuite,
    domain: entry.domain,
    reviewStatus: entry.reviewStatus ?? 'pending',
    reviewDecision: entry.reviewDecision ?? null,
    runtime: entry.executionEnvironment.runtime,
    pr: entry.executionPhases.pr.status,
    nightly: entry.executionPhases.nightly.status,
    caseDeclarations: cases.length,
    caseExamples: cases.slice(0, 2).map((c) => c.title),
    skippedDeclarations: skipped + skippedDescribe,
    conditionalSkips,
    factoryCaseCalls: factoryNames.size,
    focusedDeclarations: focus,
    directAssertionCalls: assertions,
    noDirectAssertionCases: noAssert,
    databaseWiringDetected: databaseWiring,
    fileReads: reads,
    sourceCodeReadArguments: sourceReads,
    lines: source.split(/\r?\n/u).length,
    findings: openFindings,
    reviewedResolutions: resolved,
    priority,
  };
}
export async function buildFullAudit(root, architecture) {
  const entries = architecture.entries;
  const files = new Array(entries.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(20, entries.length) }, async () => {
      while (next < entries.length) {
        const i = next++;
        const entry = entries[i];
        const source = await fs.readFile(path.resolve(root, entry.path), 'utf8');
        files[i] = inspectTestFile(entry, source);
      }
    }),
  );
  const issueCounts = Object.fromEntries(
    Object.entries(FINDINGS).map(([id, [severity, title]]) => [
      id,
      { severity, title, files: files.filter((f) => f.findings.some((x) => x.id === id)).length },
    ]),
  );
  const summary = {
    scannedFiles: files.length,
    caseDeclarations: files.reduce((s, f) => s + f.caseDeclarations, 0),
    factoryCaseCalls: files.reduce((s, f) => s + f.factoryCaseCalls, 0),
    filesWithDirectAssertions: files.filter((f) => f.directAssertionCalls > 0).length,
    noAssertionFiles: files.filter((f) => f.caseDeclarations > 0 && f.directAssertionCalls === 0)
      .length,
    manuallyReviewedSamples: files.filter((f) => f.reviewStatus === 'reviewed-sample').length,
    correctedPrimaryClassifications: architecture.entries.filter(
      (entry) =>
        entry.reviewStatus === 'reviewed-sample' &&
        entry.inferredBeforeReview &&
        (entry.testType !== entry.inferredBeforeReview.testType ||
          entry.testRole !== entry.inferredBeforeReview.testRole),
    ).length,
    automatedOnly: files.filter((f) => f.reviewStatus !== 'reviewed-sample').length,
    flaggedFiles: files.filter((f) => f.findings.length > 0).length,
    reviewedResolvedSignals: files.reduce((sum, f) => sum + f.reviewedResolutions.length, 0),
    retirementProven: 0,
    types: architecture.summary.byTestType,
    roles: architecture.summary.byTestRole,
    risks: architecture.riskMatrix.length,
    storyFiles: architecture.stories.length,
  };
  return {
    version: 1,
    method: 'AST static scan + existing evidence, not full manual assertion review',
    summary,
    issueCounts,
    files,
    risks: architecture.riskMatrix,
    overlaps: architecture.overlapGroups,
  };
}
