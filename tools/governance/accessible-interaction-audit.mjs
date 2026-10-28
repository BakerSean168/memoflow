#!/usr/bin/env node
/**
 * W9 accessibility boundary: application click targets must use semantic controls.
 * Interactive visual containers and Badge components are intentionally forbidden;
 * use button/link or a shared primitive so keyboard behavior is inherited.
 * Icon-only <Button size="icon"> anywhere under packages/app-vue must carry an explicit
 * aria-label / aria-labelledby (moved from app-vue iconButtonAccessibility.spec.ts, #488).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { parse } from '@vue/compiler-sfc';
import { NodeTypes } from '@vue/compiler-core';

const root = resolve(import.meta.dirname, '../..');
const appVueSourceRoot = join(root, 'packages/app-vue/src');
const forbiddenTags = new Set(['div', 'span', 'Badge']);
const booleanControlTags = new Set(['Switch', 'Checkbox']);
const violations = [];

for (const file of walk(appVueSourceRoot)) {
  const source = readFileSync(file, 'utf8');
  const { descriptor } = parse(source, { filename: file });
  if (!descriptor.template?.ast) continue;
  visit(descriptor.template.ast, file);
}

for (const file of walk(join(root, 'packages/app-vue'))) {
  const source = readFileSync(file, 'utf8');
  const { descriptor } = parse(source, { filename: file });
  if (!descriptor.template?.ast) continue;
  visitIconButtons(descriptor.template.ast, file);
}

if (violations.length > 0) {
  console.error('[accessible-interaction-audit] FAIL: non-semantic click target(s) found:');
  for (const violation of violations) console.error(`  - ${violation}`);
  process.exit(1);
}

console.log(
  '[accessible-interaction-audit] OK: app-vue click targets use semantic controls; icon Buttons are named.',
);

function visit(node, file) {
  if (node.type === NodeTypes.ELEMENT) {
    const click = node.props.find(
      (prop) =>
        prop.type === NodeTypes.DIRECTIVE && prop.name === 'on' && prop.arg?.content === 'click',
    );
    if (click && forbiddenTags.has(node.tag)) {
      const line = node.loc.start.line;
      violations.push(`${relative(root, file).replace(/\\/g, '/')}:${line} <${node.tag}> @click`);
    }

    if (
      booleanControlTags.has(node.tag) &&
      !node.props.some((prop) => {
        if (prop.type === NodeTypes.ATTRIBUTE) {
          return ['id', 'aria-label', 'aria-labelledby'].includes(prop.name);
        }
        return (
          prop.type === NodeTypes.DIRECTIVE &&
          prop.name === 'bind' &&
          ['id', 'aria-label', 'aria-labelledby'].includes(prop.arg?.content)
        );
      })
    ) {
      const line = node.loc.start.line;
      violations.push(
        `${relative(root, file).replace(/\\/g, '/')}:${line} <${node.tag}> missing accessible name`,
      );
    }
  }

  if ('children' in node && Array.isArray(node.children)) {
    for (const child of node.children) visit(child, file);
  }
  if (node.type === NodeTypes.IF) {
    for (const branch of node.branches) visit(branch, file);
  }
  if (node.type === NodeTypes.FOR && node.children) {
    for (const child of node.children) visit(child, file);
  }
}

function hasProp(node, name, value) {
  return node.props.some((prop) => {
    if (prop.type === NodeTypes.ATTRIBUTE)
      return prop.name === name && (value === undefined || prop.value?.content === value);
    return (
      prop.type === NodeTypes.DIRECTIVE &&
      prop.name === 'bind' &&
      prop.arg?.content === name &&
      (value === undefined || prop.exp?.content?.trim() === `'${value}'`)
    );
  });
}

function visitIconButtons(node, file) {
  if (
    node.type === NodeTypes.ELEMENT &&
    node.tag === 'Button' &&
    hasProp(node, 'size', 'icon') &&
    !hasProp(node, 'aria-label') &&
    !hasProp(node, 'aria-labelledby')
  ) {
    violations.push(
      `${relative(root, file).replace(/\\/g, '/')}:${node.loc.start.line} icon <Button> missing accessible name`,
    );
  }
  if ('children' in node && Array.isArray(node.children)) {
    for (const child of node.children) visitIconButtons(child, file);
  }
  if (node.type === NodeTypes.IF) {
    for (const branch of node.branches) visitIconButtons(branch, file);
  }
}

function walk(directory, output = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) walk(fullPath, output);
    else if (entry.name.endsWith('.vue')) output.push(fullPath);
  }
  return output;
}
