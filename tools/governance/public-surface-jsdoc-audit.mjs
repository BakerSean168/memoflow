#!/usr/bin/env node

/**
 * Public-surface bilingual JSDoc audit (RefArch Phase 6).
 * 公共表面双语 JSDoc 审计（RefArch 阶段 6）。
 *
 * Targeted audit over the Phase 6 public surfaces (§3.6), not a repo-wide
 * allowlist: the shared module contract, the API observability public seam, the
 * app-local PowerSync factories, the 11 feature `api/module.ts`
 * public exports, and the new governance detector helpers.
 *
 * 针对阶段 6 公共表面的定向审计（§3.6），而非全仓 allowlist：共享模块契约、
 * API observability 公共 seam、app-local PowerSync 工厂、11 个
 * feature `api/module.ts` 公共导出，以及新增的 governance detector helpers。
 *
 * Every exported interface/type/class/function/const requires a JSDoc block
 * that is English-first / 中文-second, and carries the correct tags:
 * `@param` for parameters, `@returns` for non-void functions, `@typeParam`
 * for generics, `@internal` for internal adapters.
 *
 * 每个导出的 interface/type/class/function/const 都需要 English first /
 * 中文 second 的 JSDoc 块，并携带正确标签：参数 `@param`、非 void 函数
 * `@returns`、泛型 `@typeParam`、内部 adapter `@internal`。
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { parseSource, walk } from './lib/architecture-surface.mjs';

const ROOT = process.env.PUBLIC_SURFACE_JSDOC_ROOT ?? path.join(import.meta.dirname, '..', '..');

const FEATURE_MODULES = [
  'governance',
  'goal',
  'task',
  'account',
  'ai',
  'data-portability',
  'notification',
  'reminder',
  'repository',
  'schedule',
  'setting',
].map((pkg) => `packages/${pkg}/src/api/module.ts`);

const DEFAULT_PATHS = [
  'packages/contracts/src/shared/server-module-context.ts',
  'apps/api/src/shared/infrastructure/observability/http-request-observation.ts',
  'apps/api/src/shared/infrastructure/observability/http-request-metrics.ts',
  'apps/api/src/shared/infrastructure/observability/http-request-trace.ts',
  'apps/api/src/shared/infrastructure/observability/noop-http-request-trace.ts',
  'apps/api/src/shared/infrastructure/observability/opentelemetry-http-request-trace.ts',
  'apps/api/src/shared/infrastructure/observability/trace-runtime.ts',
  'apps/api/src/modules/powersync/module.ts',
  'tools/governance/lib/architecture-surface.mjs',
  ...FEATURE_MODULES,
];

const AUDITED_PATHS = process.env.PUBLIC_SURFACE_JSDOC_PATHS
  ? process.env.PUBLIC_SURFACE_JSDOC_PATHS.split(',')
      .map((p) => p.trim())
      .filter(Boolean)
  : DEFAULT_PATHS;

const violations = [];
const auditedExports = [];

for (const rel of AUDITED_PATHS) {
  const absolute = path.join(ROOT, rel);
  if (!ts.sys.fileExists(absolute)) {
    violations.push(`${rel}: audited file missing`);
    continue;
  }
  const source = parseSource(readFileSync(absolute, 'utf8'), rel);
  for (const statement of source.statements) {
    if ((ts.getCombinedModifierFlags(statement) & ts.ModifierFlags.Export) === 0) continue;
    auditExport(statement, rel);
  }
}

if (violations.length > 0) {
  console.error(`[public-surface-jsdoc-audit] failed with ${violations.length} issue(s):`);
  for (const violation of violations) {
    console.error(`  - ${violation}`);
  }
  process.exit(1);
}

console.log(
  `[public-surface-jsdoc-audit] passed. audited ${auditedExports.length} public export(s) across ${AUDITED_PATHS.length} path(s).`,
);

/** Audits one exported declaration. 审计一个导出声明。 */
function auditExport(statement, rel) {
  let name = '';
  let jsdoc = '';
  let ctorJsdoc = '';
  let params = [];
  let typeParams = null;
  let isFunctionLike = false;
  let hasValueReturn = false;
  let returnTypeVoid = false;

  if (ts.isInterfaceDeclaration(statement)) {
    name = statement.name.text;
    typeParams = statement.typeParameters ?? null;
  } else if (ts.isTypeAliasDeclaration(statement)) {
    name = statement.name.text;
    typeParams = statement.typeParameters ?? null;
  } else if (ts.isClassDeclaration(statement)) {
    name = statement.name?.text ?? '<anonymous>';
    typeParams = statement.typeParameters ?? null;
    const ctor = statement.members.find((m) => ts.isConstructorDeclaration(m));
    if (ctor) {
      params = ctor.parameters ?? [];
      ctorJsdoc = extractJsdoc(ctor);
    }
  } else if (ts.isFunctionDeclaration(statement)) {
    name = statement.name?.text ?? '<anonymous>';
    params = statement.parameters ?? [];
    typeParams = statement.typeParameters ?? null;
    isFunctionLike = true;
    hasValueReturn = bodyHasValueReturn(statement.body);
    returnTypeVoid = isVoidType(statement.type);
  } else if (ts.isVariableStatement(statement)) {
    for (const decl of statement.declarationList.declarations) {
      if (ts.isIdentifier(decl.name)) {
        name = decl.name.text;
        if (decl.initializer && ts.isArrowFunction(decl.initializer)) {
          const arrow = decl.initializer;
          params = arrow.parameters ?? [];
          typeParams = arrow.typeParameters ?? null;
          isFunctionLike = true;
          hasValueReturn = bodyHasValueReturn(arrow.body);
          returnTypeVoid = isVoidType(arrow.type);
        }
        break;
      }
    }
  } else {
    return;
  }

  auditedExports.push(`${rel}#${name}`);
  jsdoc = extractJsdoc(statement);

  if (!jsdoc) {
    violations.push(`${rel}: public export '${name}' has no JSDoc.`);
    return;
  }

  // English first / 中文 second.
  const firstEnglish = jsdoc.search(/[A-Za-z]{3,}/);
  const firstChinese = jsdoc.search(/[\u4e00-\u9fff]/);
  if (firstEnglish === -1 || firstChinese === -1) {
    violations.push(`${rel}: '${name}' JSDoc must contain both English and 中文.`);
  } else if (firstChinese < firstEnglish) {
    violations.push(`${rel}: '${name}' JSDoc must be English first / 中文 second.`);
  }

  if (params.length > 0 && !/@param\b/.test(`${jsdoc} ${ctorJsdoc}`)) {
    violations.push(`${rel}: function/factory '${name}' JSDoc missing @param for its parameters.`);
  }

  if (isFunctionLike) {
    const needsReturns = hasValueReturn || (!returnTypeVoid && params.length > 0);
    if (needsReturns && !/@returns?\b/.test(jsdoc)) {
      violations.push(`${rel}: function/factory '${name}' JSDoc missing @returns.`);
    }
  }

  if (typeParams && typeParams.length > 0 && !/@typeParam\b/.test(jsdoc)) {
    violations.push(`${rel}: generic '${name}' JSDoc missing @typeParam.`);
  }
}

/** Extracts the JSDoc block immediately before a statement.
 *  提取语句紧邻之前的 JSDoc 块。 */
function extractJsdoc(statement) {
  const fullText = statement.getSourceFile().getFullText();
  const start = statement.getStart();
  const before = fullText.slice(0, start).trimEnd();
  if (!before.endsWith('*/')) return '';
  const jsdocStart = before.lastIndexOf('/**');
  if (jsdocStart === -1) return '';
  return before.slice(jsdocStart);
}

/** Whether a function body contains a `return` with a value.
 *  函数体是否包含带值的 `return`。 */
function bodyHasValueReturn(body) {
  if (!body) return false;
  let found = false;
  walk(body, (node) => {
    if (found) return false;
    if (ts.isReturnStatement(node) && node.expression) {
      found = true;
      return false;
    }
  });
  return found;
}

/** Whether a type annotation is `void` (or `Promise<void>`). */
function isVoidType(typeNode) {
  if (!typeNode) return true;
  const text = typeNode.getText();
  return /^(void|Promise<void>)$/.test(text.replace(/\s+/g, ''));
}
