import { parse as parseSfc } from '@vue/compiler-sfc';
import { parse as parseTemplate } from '@vue/compiler-dom';
import ts from 'typescript';

/**
 * Structural view of a TypeScript module or Vue single-file component.
 *
 * Source-text locks are brittle: a rename, reformat or comment trips them and a
 * behavioural regression does not. This module exposes the parts of the source
 * that actually carry structure (template elements/attributes, imports,
 * exports, identifiers, calls, object property literals) so governance rules
 * can assert intent without matching raw text.
 */

const ELEMENT_NODE = 1;
const ATTRIBUTE_NODE = 6;
const DIRECTIVE_NODE = 7;

function normalize(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function directiveName(prop) {
  const arg = prop.arg?.content;
  switch (prop.name) {
    case 'bind':
      return arg ? `:${arg}` : 'v-bind';
    case 'on':
      return arg ? `@${arg}` : 'v-on';
    case 'model':
      return arg ? `v-model:${arg}` : 'v-model';
    case 'slot':
      return arg ? `#${arg}` : 'v-slot';
    default:
      return arg ? `v-${prop.name}:${arg}` : `v-${prop.name}`;
  }
}

function scriptKind(file) {
  if (file.endsWith('.tsx')) return ts.ScriptKind.TSX;
  return ts.ScriptKind.TS;
}

function expressionSource(expression) {
  return `const __memoflow_expression__ = (${expression});`;
}

function collectTypeScript(file, source, target) {
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(file),
  );
  const visit = (node) => {
    if (ts.isIdentifier(node))
      target.identifiers.set(node.text, (target.identifiers.get(node.text) ?? 0) + 1);

    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const names = [];
      const clause = node.importClause;
      if (clause?.name) names.push(clause.name.text);
      if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const element of clause.namedBindings.elements) names.push(element.name.text);
      }
      target.imports.push({
        from: node.moduleSpecifier.text,
        names,
        typeOnly: Boolean(clause?.isTypeOnly),
      });
      target.stringLiterals.push(node.moduleSpecifier.text);
    }

    if (ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        const names =
          node.exportClause && ts.isNamedExports(node.exportClause)
            ? node.exportClause.elements.map((element) => element.name.text)
            : [];
        target.imports.push({
          from: node.moduleSpecifier.text,
          names,
          typeOnly: Boolean(node.isTypeOnly),
        });
        target.stringLiterals.push(node.moduleSpecifier.text);
      }
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        for (const element of node.exportClause.elements) {
          target.exports.add(element.name.text);
          target.exportKinds.set(element.name.text, 're-export');
        }
      }
    }

    if (ts.isExportAssignment(node)) target.exports.add('default');

    if (
      (ts.isFunctionDeclaration(node) ||
        ts.isClassDeclaration(node) ||
        ts.isInterfaceDeclaration(node) ||
        ts.isTypeAliasDeclaration(node) ||
        ts.isEnumDeclaration(node)) &&
      node.name &&
      node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      target.exports.add(node.name.text);
      const kind = ts.isFunctionDeclaration(node)
        ? 'function'
        : ts.isClassDeclaration(node)
          ? 'class'
          : ts.isInterfaceDeclaration(node)
            ? 'interface'
            : ts.isTypeAliasDeclaration(node)
              ? 'type'
              : 'enum';
      target.exportKinds.set(node.name.text, kind);
    }

    if (
      ts.isVariableStatement(node) &&
      node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      for (const declaration of node.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          target.exports.add(declaration.name.text);
          target.exportKinds.set(declaration.name.text, 'variable');
        }
      }
    }

    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      const callee = normalize(node.expression.getText(sourceFile));
      if (ts.isNewExpression(node))
        target.newExpressions.set(callee, (target.newExpressions.get(callee) ?? 0) + 1);
      else target.calls.set(callee, (target.calls.get(callee) ?? 0) + 1);
    }

    if (ts.isTypeReferenceNode(node)) {
      const name = normalize(node.typeName.getText(sourceFile));
      target.typeReferences.set(name, (target.typeReferences.get(name) ?? 0) + 1);
    }

    if (ts.isTypeNode(node)) {
      const text = normalize(node.getText(sourceFile));
      if (text.length > 0) {
        target.typeNodes.set(text, (target.typeNodes.get(text) ?? 0) + 1);
        const compact = text.replace(/\s+/g, '');
        if (compact !== text)
          target.typeNodes.set(compact, (target.typeNodes.get(compact) ?? 0) + 1);
      }
    }

    if (
      ts.isPropertySignature(node) ||
      ts.isMethodSignature(node) ||
      ts.isPropertyDeclaration(node) ||
      ts.isMethodDeclaration(node)
    ) {
      const text = normalize(node.getText(sourceFile));
      if (text.length > 0) {
        target.typeMembers.set(text, (target.typeMembers.get(text) ?? 0) + 1);
        const compact = text.replace(/\s+/g, '');
        if (compact !== text)
          target.typeMembers.set(compact, (target.typeMembers.get(compact) ?? 0) + 1);
        const withoutSemicolon = text.replace(/;$/, '');
        if (withoutSemicolon !== text) {
          target.typeMembers.set(
            withoutSemicolon,
            (target.typeMembers.get(withoutSemicolon) ?? 0) + 1,
          );
          target.typeMembers.set(
            withoutSemicolon.replace(/\s+/g, ''),
            (target.typeMembers.get(withoutSemicolon.replace(/\s+/g, '')) ?? 0) + 1,
          );
        }
      }
      if (node.name && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name))) {
        target.propertyNames.set(
          node.name.text,
          (target.propertyNames.get(node.name.text) ?? 0) + 1,
        );
      }
    }

    if (ts.isExpressionNode(node) || ts.isStatement(node)) {
      const text = normalize(node.getText(sourceFile));
      if (text.length > 0) {
        if (ts.isStatement(node)) {
          target.statements.set(text, (target.statements.get(text) ?? 0) + 1);
          const withoutSemicolon = text.replace(/;$/, '');
          if (withoutSemicolon !== text) {
            target.statements.set(
              withoutSemicolon,
              (target.statements.get(withoutSemicolon) ?? 0) + 1,
            );
          }
        } else {
          target.expressions.set(text, (target.expressions.get(text) ?? 0) + 1);
        }
        const compact = text.replace(/\s+/g, '');
        if (compact !== text) {
          if (ts.isStatement(node))
            target.statements.set(compact, (target.statements.get(compact) ?? 0) + 1);
          else target.expressions.set(compact, (target.expressions.get(compact) ?? 0) + 1);
        }
      }
    }

    if (ts.isPropertyAccessExpression(node)) {
      const path = normalize(node.getText(sourceFile));
      target.memberPaths.set(path, (target.memberPaths.get(path) ?? 0) + 1);
    }

    if (ts.isPropertyAssignment(node)) {
      const name =
        ts.isIdentifier(node.name) || ts.isStringLiteral(node.name) ? node.name.text : null;
      if (name) target.propertyNames.set(name, (target.propertyNames.get(name) ?? 0) + 1);
      if (
        name &&
        (ts.isStringLiteral(node.initializer) ||
          ts.isNumericLiteral(node.initializer) ||
          ts.isIdentifier(node.initializer) ||
          node.initializer.kind === ts.SyntaxKind.TrueKeyword ||
          node.initializer.kind === ts.SyntaxKind.FalseKeyword)
      ) {
        target.objectProperties.push({
          name,
          value:
            ts.isStringLiteral(node.initializer) ||
            ts.isNumericLiteral(node.initializer) ||
            ts.isIdentifier(node.initializer)
              ? node.initializer.text
              : node.initializer.kind === ts.SyntaxKind.TrueKeyword
                ? 'true'
                : 'false',
        });
      }
      const text = normalize(node.getText(sourceFile));
      if (name && text.length > 0)
        target.objectPropertyTexts.set(text, (target.objectPropertyTexts.get(text) ?? 0) + 1);
    }

    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      target.stringLiterals.push(node.text);
    }

    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return sourceFile;
}

function collectExpression(file, expression, target) {
  if (!expression || expression.trim().length === 0) return;
  const source = expressionSource(expression);
  try {
    const sourceFile = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    if (sourceFile.parseDiagnostics.length > 0) return;
    const visit = (node) => {
      if (ts.isIdentifier(node))
        target.identifiers.set(node.text, (target.identifiers.get(node.text) ?? 0) + 1);
      if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
        const callee = normalize(node.expression.getText(sourceFile));
        if (ts.isNewExpression(node))
          target.newExpressions.set(callee, (target.newExpressions.get(callee) ?? 0) + 1);
        else target.calls.set(callee, (target.calls.get(callee) ?? 0) + 1);
      }
      if (ts.isPropertyAccessExpression(node)) {
        const path = normalize(node.getText(sourceFile));
        target.memberPaths.set(path, (target.memberPaths.get(path) ?? 0) + 1);
      }
      if (ts.isTypeReferenceNode(node)) {
        const name = normalize(node.typeName.getText(sourceFile));
        target.typeReferences.set(name, (target.typeReferences.get(name) ?? 0) + 1);
      }
      if (ts.isTypeNode(node)) {
        const text = normalize(node.getText(sourceFile));
        if (text.length > 0) target.typeNodes.set(text, (target.typeNodes.get(text) ?? 0) + 1);
      }
      if (
        ts.isPropertySignature(node) ||
        ts.isMethodSignature(node) ||
        ts.isPropertyDeclaration(node) ||
        ts.isMethodDeclaration(node)
      ) {
        const text = normalize(node.getText(sourceFile));
        if (text.length > 0) target.typeMembers.set(text, (target.typeMembers.get(text) ?? 0) + 1);
      }
      if (ts.isExpressionNode(node) || ts.isStatement(node)) {
        const text = normalize(node.getText(sourceFile));
        if (text.length > 0) {
          if (ts.isStatement(node))
            target.statements.set(text, (target.statements.get(text) ?? 0) + 1);
          else target.expressions.set(text, (target.expressions.get(text) ?? 0) + 1);
        }
      }
      if (ts.isPropertyAssignment(node)) {
        const name =
          ts.isIdentifier(node.name) || ts.isStringLiteral(node.name) ? node.name.text : null;
        if (name) target.propertyNames.set(name, (target.propertyNames.get(name) ?? 0) + 1);
        if (
          name &&
          (ts.isStringLiteral(node.initializer) ||
            ts.isNumericLiteral(node.initializer) ||
            ts.isIdentifier(node.initializer) ||
            node.initializer.kind === ts.SyntaxKind.TrueKeyword ||
            node.initializer.kind === ts.SyntaxKind.FalseKeyword)
        ) {
          target.objectProperties.push({
            name,
            value:
              ts.isStringLiteral(node.initializer) ||
              ts.isNumericLiteral(node.initializer) ||
              ts.isIdentifier(node.initializer)
                ? node.initializer.text
                : node.initializer.kind === ts.SyntaxKind.TrueKeyword
                  ? 'true'
                  : 'false',
          });
        }
        const text = normalize(node.getText(sourceFile));
        if (name && text.length > 0)
          target.objectPropertyTexts.set(text, (target.objectPropertyTexts.get(text) ?? 0) + 1);
      }
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        target.stringLiterals.push(node.text);
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  } catch {
    // Template expressions are not always standalone TypeScript; identifiers
    // from those are still collected by the coarse fallback below.
  }
}

function collectTemplate(file, template, target) {
  const ast = parseTemplate(template);
  const walk = (node) => {
    if (node.type === ELEMENT_NODE) {
      const attributes = [];
      for (const prop of node.props) {
        if (prop.type === ATTRIBUTE_NODE) {
          attributes.push({
            name: prop.name,
            value: prop.value?.content ?? '',
            offset: prop.loc.start.offset,
          });
          if (prop.value?.content) target.stringLiterals.push(prop.value.content);
          if (prop.name === 'class') target.classStrings.push(prop.value?.content ?? '');
        } else if (prop.type === DIRECTIVE_NODE) {
          const name = directiveName(prop);
          const value = prop.exp?.content ?? '';
          attributes.push({ name, value, offset: prop.loc.start.offset });
          if (value) target.stringLiterals.push(value);
          if (name === 'class' || name === ':class' || name === 'v-bind:class') {
            target.classStrings.push(value);
          }
          collectExpression(file, value, target);
        }
      }
      target.elements.push({
        tag: node.tag,
        attributes,
        offset: node.loc.start.offset,
      });
    }
    for (const child of node.children ?? []) walk(child);
  };
  walk(ast);
}

function emptyTarget() {
  return {
    elements: [],
    identifiers: new Map(),
    imports: [],
    exports: new Set(),
    calls: new Map(),
    newExpressions: new Map(),
    memberPaths: new Map(),
    typeReferences: new Map(),
    exportKinds: new Map(),
    propertyNames: new Map(),
    typeNodes: new Map(),
    typeMembers: new Map(),
    expressions: new Map(),
    statements: new Map(),
    objectProperties: [],
    objectPropertyTexts: new Map(),
    cssTokens: new Set(),
    cssText: [],
    stringLiterals: [],
    classStrings: [],
  };
}

export function analyzeSource(file, source) {
  const target = emptyTarget();
  if (file.endsWith('.vue')) {
    const { descriptor, errors } = parseSfc(source, { filename: file });
    if (errors.length > 0) throw new Error(`cannot parse ${file}: ${errors[0].message}`);
    if (descriptor.template?.content) collectTemplate(file, descriptor.template.content, target);
    for (const style of descriptor.styles ?? []) {
      target.cssText.push(style.content);
      for (const match of style.content.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) {
        target.cssTokens.add(match[1]);
      }
    }
    for (const block of [descriptor.script, descriptor.scriptSetup]) {
      if (block?.content) collectTypeScript(file, block.content, target);
    }
  } else {
    collectTypeScript(file, source, target);
  }
  for (const literal of target.stringLiterals) target.classStrings.push(literal);
  return target;
}

export function classTokens(analysis) {
  const tokens = new Set(analysis.cssTokens ?? []);
  for (const text of analysis.classStrings) {
    for (const token of text.split(/\s+/)) if (token.length > 0) tokens.add(token);
  }
  return tokens;
}

export function classSequences(analysis) {
  return analysis.classStrings.map((text) => text.split(/\s+/).filter(Boolean));
}

export function elementMatches(element, name, attributes) {
  if (element.tag !== name) return false;
  for (const [attributeName, attributeValue] of Object.entries(attributes ?? {})) {
    const found = element.attributes.find((attribute) => attribute.name === attributeName);
    if (!found) return false;
    if (attributeValue !== undefined && found.value !== attributeValue) return false;
  }
  return true;
}
