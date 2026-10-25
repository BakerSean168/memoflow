import ts from 'typescript';

function sourceFile(file, source) {
  return ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    /\.(?:tsx|jsx)$/u.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}
function visit(node, fn) {
  fn(node);
  ts.forEachChild(node, (child) => visit(child, fn));
}
function calleeName(expression) {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression))
    return calleeName(expression.expression) + '.' + expression.name.text;
  if (ts.isCallExpression(expression)) return calleeName(expression.expression);
  return '';
}
function importedSymbols(ast) {
  const result = new Map();
  visit(ast, (node) => {
    if (!ts.isImportDeclaration(node)) return;
    const module = node.moduleSpecifier.text;
    const clause = node.importClause;
    if (!clause || clause.isTypeOnly) return;
    if (clause.name) result.set(clause.name.text, module);
    if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const imported of clause.namedBindings.elements) {
        if (!imported.isTypeOnly) result.set(imported.name.text, module);
      }
    }
  });
  return result;
}

/**
 * The result is a triage signal, NOT proof that a test may be retired.
 * A deleted test that calls production functions inside expect() is never
 * eligible for the blanket "source-text-only" retirement category.
 */
export function inspectRetirementProposal(file, source) {
  const ast = sourceFile(file, source);
  const imports = importedSymbols(ast);
  const behaviorInvocations = new Set();
  const runtimeImports = new Set();
  let existenceCalls = 0;
  let screenshotCalls = 0;
  let assertions = 0;
  visit(ast, (node) => {
    if (!ts.isCallExpression(node)) return;
    const name = calleeName(node.expression);
    if (name === 'existsSync') existenceCalls++;
    if (name === 'page.screenshot' || name.endsWith('.screenshot')) screenshotCalls++;
    if (name === 'expect' || name === 'assert') assertions++;
    // Production operations performed in setup or the body (including before
    // expect) are part of the test's contract, not only nested expect calls.
    const importedFrom = imports.get(name.split('.')[0]);
    if (
      importedFrom &&
      (importedFrom.startsWith('.') || importedFrom.startsWith('@memoflow/')) &&
      !['test', 'expect', 'describe', 'it'].includes(name)
    ) {
      behaviorInvocations.add(name);
    }
    if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const module = node.arguments[0];
      if (
        module &&
        ts.isStringLiteral(module) &&
        (module.text.startsWith('.') || module.text.startsWith('@memoflow/'))
      )
        runtimeImports.add(module.text);
    }
  });
  const hasScreenshot = screenshotCalls > 0;
  const category = hasScreenshot
    ? 'screenshot-artifact'
    : behaviorInvocations.size || runtimeImports.size
      ? 'mixed-runtime-behavior'
      : existenceCalls
        ? 'path-or-schema-invariant'
        : 'source-text-candidate';
  return {
    file,
    category,
    assertions,
    existenceCalls,
    screenshotCalls,
    behaviorInvocations: [...behaviorInvocations].sort(),
    dynamicRuntimeImports: [...runtimeImports].sort(),
  };
}

/**
 * Snapshot a Playwright spec's identity preconditions.
 * Scans entrypoints, not execution traces; a call in a helper can run once
 * per test or conditionally, which needs a separate review.
 */
export function inspectAuthPrecondition(file, source) {
  const ast = sourceFile(file, source);
  const imports = importedSymbols(ast);
  const called = new Set();
  let declaredCases = 0;
  let uiRegistrationBeforeEach = 0;
  let apiRegistrationBeforeEach = 0;
  visit(ast, (node) => {
    if (!ts.isCallExpression(node)) return;
    const name = calleeName(node.expression);
    if (['test', 'test.only', 'test.skip', 'test.fixme'].includes(name)) declaredCases++;
    if (name === 'test.beforeEach') {
      const hookText = node.getText(ast);
      if (/registerAndLogin\s*\(/u.test(hookText)) {
        if ((imports.get('registerAndLogin') ?? '').endsWith('/auth-api'))
          apiRegistrationBeforeEach++;
        if ((imports.get('registerAndLogin') ?? '').endsWith('/testHelpers'))
          uiRegistrationBeforeEach++;
      }
    }
    if (
      [
        'registerAndLogin',
        'registerViaAuth',
        'bootstrapGoalWorkflowSession',
        'openAccountSettings',
        'loginViaApi',
        'login',
      ].includes(name)
    )
      called.add(name);
  });
  const via = imports.get('registerAndLogin') ?? '';
  const directUiRegistration =
    called.has('registerViaAuth') ||
    (called.has('registerAndLogin') && via.endsWith('/testHelpers'));
  const directApiRegistration =
    called.has('loginViaApi') || (called.has('registerAndLogin') && via.endsWith('/auth-api'));
  const goalWorkflowFixture =
    called.has('bootstrapGoalWorkflowSession') &&
    (imports.get('bootstrapGoalWorkflowSession') ?? '').endsWith('/goal-workflow.fixture');
  const accountSettingsFixture =
    called.has('openAccountSettings') &&
    (imports.get('openAccountSettings') ?? '').endsWith('/account-settings.helpers');
  return {
    file,
    declaredCases,
    directUiRegistration,
    directApiRegistration,
    goalWorkflowFixture,
    accountSettingsFixture,
    uiRegistrationBeforeEach,
    apiRegistrationBeforeEach,
    isAuthFeatureTest: file.includes('/authentication/'),
  };
}

export const SPEC_GROUPS = Object.freeze({
  'required-flow': 'apps/web/web-flow-specs.mjs',
  'nightly-audit': 'apps/web/web-audit-specs.mjs',
});
export function declaredWebSpecs(source) {
  return [...source.matchAll(/['"]([^'"]+\.spec\.ts)['"]/gu)].map((match) => match[1]);
}
