#!/usr/bin/env node
/** Inspect active module imports and input literals; package scanning is audit-subject inspection. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { resolveEngineeringRuleFile } from './lib/engineering-rule-source.mjs';

const ENTRY = 'tools/governance/engineering-rule-adapter.mjs';
const SUBJECT_SCANNERS = new Set([
  'tools/governance/lib/package-internal-boundary-runner.mjs',
  'tools/governance/lib/package-internal-boundary.mjs',
]);
const FORBIDDEN_PATH =
  /(?:packages\/(?:governance|contracts\/src\/modules\/governance|database)|contracts\/governance|@memoflow\/(?:governance|database)|@prisma\/client|(?:^|\/)legacy-|\/__fixtures__\/|\/published\/|published-rule-bundle|governance-rule-bundle-adapter|pinned-rule-bundles|engineering-rule-adapters\.json|exporter|\.prisma(?:$|\/))/;

export function auditEngineeringInputDependencies(root) {
  const pending = [ENTRY];
  const visited = new Set();
  while (pending.length) {
    const file = pending.pop();
    if (visited.has(file)) continue;
    if (!file.startsWith('tools/governance/') || FORBIDDEN_PATH.test(file)) {
      throw new Error(`${file}: forbidden active dependency`);
    }
    visited.add(file);
    const source = ts.createSourceFile(
      file,
      readFileSync(resolveEngineeringRuleFile(root, file), 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.JS,
    );
    function visit(node) {
      if (ts.isImportDeclaration(node) || (ts.isExportDeclaration(node) && node.moduleSpecifier)) {
        const specifier = node.moduleSpecifier.text;
        if (specifier.startsWith('node:')) {
          if (!['node:fs', 'node:path', 'node:crypto'].includes(specifier))
            throw new Error(`${file}: unsupported builtin ${specifier}`);
          if (specifier === 'node:fs') {
            const bindings = node.importClause?.namedBindings;
            const allowed = new Set([
              'readFileSync',
              'realpathSync',
              'statSync',
              'existsSync',
              'readdirSync',
            ]);
            if (
              node.importClause?.name ||
              !bindings ||
              !ts.isNamedImports(bindings) ||
              bindings.elements.some(
                (element) => !allowed.has((element.propertyName ?? element.name).text),
              )
            ) {
              throw new Error(`${file}: filesystem imports must be explicitly read-only`);
            }
          }
        } else if (specifier.startsWith('.')) {
          pending.push(path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier)));
        } else throw new Error(`${file}: external dependency ${specifier}`);
      }
      if (
        (ts.isIdentifier(node) || ts.isStringLiteral(node)) &&
        [
          'require',
          'fetch',
          'eval',
          'Function',
          'WebSocket',
          'getBuiltinModule',
          'binding',
        ].includes(node.text)
      ) {
        throw new Error(`${file}: dynamic module/network dependency`);
      }
      if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) && ['require', 'fetch'].includes(node.expression.text)))
      ) {
        throw new Error(`${file}: dynamic module/network dependency`);
      }
      // Only the two exact database specifier literals in subject scanners describe violations.
      // Imports are still checked above; comments and regex literals are never input paths.
      if (
        (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
        FORBIDDEN_PATH.test(node.text) &&
        !(
          SUBJECT_SCANNERS.has(file) && ['@memoflow/database', '@prisma/client'].includes(node.text)
        )
      ) {
        throw new Error(`${file}: forbidden input path ${node.text}`);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  const command = JSON.parse(readFileSync(resolveEngineeringRuleFile(root, 'project.json'), 'utf8'))
    .targets['governance-check'].options.command;
  if (
    !command.includes(`${ENTRY} --source tools/governance/engineering-rules.json --mode check`) ||
    command.includes('governance-rule-bundle-adapter.mjs') ||
    command.includes('tools/governance/published/')
  ) {
    throw new Error('Root gate must select native Engineering source');
  }
  return [...visited].sort();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const files = auditEngineeringInputDependencies(path.resolve(import.meta.dirname, '../..'));
    console.log(
      `[engineering-input-dependency] ${files.length} active modules; no Product input dependency`,
    );
  } catch (error) {
    console.error(`[engineering-input-dependency] ${error.message}`);
    process.exitCode = 1;
  }
}
