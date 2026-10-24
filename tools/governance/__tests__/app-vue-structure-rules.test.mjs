import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  findStructureRuleViolations,
  validateStructureRuleManifest,
} from '../lib/app-vue-structure-rules.mjs';
import manifest from '../app-vue-structure-rules.json' with { type: 'json' };

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture(files) {
  const root = path.join(tmpdir(), `memoflow-structure-rules-${crypto.randomUUID()}`);
  roots.push(root);
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
  return root;
}

const rule = (locks) => ({
  version: 1,
  rules: locks.map((entry) => ({ id: 'x', reason: 'test', ...entry })),
});

const vue = `<template>
  <Root data-testid="root" :inert="isInert" class="surface-raised flex">
    <Child family="calendar" />
  </Root>
</template>
<script setup lang="ts">
import { useThing } from './thing';
const value = new Date();
function keep() {
  return value;
}
</script>
<style scoped>
.surface-raised { color: red; }
</style>
`;

const ts = `import { legacy } from './legacy';
export interface DesktopBridge { invoke(): void }
export function keep(value: number) {
  if (!Number.isFinite(value)) return 0;
  return value;
}
const created: Date = new Date();
const settings = { path: '/repository', enabled: true };
export { keep as default };
`;

describe('app-vue structure rules governance', () => {
  it('matches template structure through the Vue SFC AST', () => {
    const root = fixture({ 'src/Comp.vue': vue });
    expect(
      findStructureRuleViolations(
        root,
        rule([
          {
            file: 'src/Comp.vue',
            requireElements: ['Root', { name: 'Child', attrs: { family: 'calendar' } }],
            forbidElements: ['LegacyRoot'],
            requireAttributes: [
              { name: 'data-testid', value: 'root' },
              { name: ':inert', value: 'isInert' },
            ],
            forbidAttributes: [{ name: 'data-testid', value: 'legacy-root' }],
            requireClassTokens: ['surface-raised'],
            forbidClassTokens: ['legacy-surface'],
            requireClassSequences: [['surface-raised', 'flex']],
            requireCssText: ['.surface-raised'],
            counts: [{ kind: 'element', name: 'Root', equals: 1 }],
          },
        ]),
      ),
    ).toEqual([]);
  });

  it('matches script structure through the TypeScript AST', () => {
    const root = fixture({ 'src/module.ts': ts });
    expect(
      findStructureRuleViolations(
        root,
        rule([
          {
            file: 'src/module.ts',
            requireImports: [{ from: './legacy', names: ['legacy'] }],
            forbidImports: [{ from: 'electron' }],
            requireExports: ['keep', 'default'],
            requireInterfaces: ['DesktopBridge'],
            forbidInterfaces: ['LegacyBridge'],
            requireIdentifiers: ['legacy', 'settings'],
            forbidIdentifiers: ['legacyHelper'],
            requireCalls: ['Number.isFinite'],
            forbidCalls: ['Date.parse'],
            requireTypeReferences: ['Date'],
            requireExpressions: ['new Date()'],
            requireStatements: ['if (!Number.isFinite(value)) return 0'],
            requireObjectProperties: [
              { name: 'path', value: '/repository' },
              { name: 'enabled', value: 'true' },
            ],
            requireStringLiterals: ['/repository'],
            requirePropertyNames: ['invoke', 'path', 'enabled'],
            counts: [
              { kind: 'call', name: 'Number.isFinite', equals: 1 },
              { kind: 'propertyName', name: 'path', equals: 1 },
            ],
          },
        ]),
      ),
    ).toEqual([]);
  });

  it('reports missing and forbidden structure', () => {
    const root = fixture({ 'src/Comp.vue': vue, 'src/module.ts': ts });
    const violations = findStructureRuleViolations(
      root,
      rule([
        {
          file: 'src/Comp.vue',
          requireElements: ['Missing'],
          forbidElements: ['Root'],
          requireClassTokens: ['legacy-surface'],
          forbidClassTokens: ['surface-raised'],
        },
        {
          file: 'src/module.ts',
          requireExports: ['missingExport'],
          forbidInterfaces: ['DesktopBridge'],
          requireObjectProperties: [{ name: 'path', value: '/legacy' }],
        },
      ]),
    );
    expect(violations.map((violation) => violation.detail)).toEqual([
      'required element <Missing> missing',
      'forbidden element <Root> present',
      'required class token legacy-surface missing',
      'forbidden class token surface-raised present',
      'required export missingExport missing',
      'forbidden interface DesktopBridge present',
      'required object property path: /legacy missing',
    ]);
  });

  it('fails closed on missing files and invalid targets', () => {
    const root = fixture({});
    expect(
      findStructureRuleViolations(
        root,
        rule([{ file: 'src/gone.vue', requireElements: ['Root'] }]),
      )[0].detail,
    ).toBe('rule file missing');
    expect(
      validateStructureRuleManifest(
        rule([{ file: 'src/readme.md', requireIdentifiers: ['x'] }]),
      )[0],
    ).toMatch(/is not a \.vue\/\.ts\/\.tsx file/);
  });

  it('validates the manifest shape', () => {
    expect(validateStructureRuleManifest({ version: 1, rules: [] })).toContain(
      'rules must be a non-empty array',
    );
    expect(
      validateStructureRuleManifest({ version: 1, rules: [{ id: 'x', file: 'a.ts' }] })[0],
    ).toMatch(/reason is required/);
    expect(
      validateStructureRuleManifest({
        version: 1,
        rules: [
          {
            id: 'x',
            reason: 'r',
            file: 'a.ts',
            requireIdentifiers: ['x'],
            scan: { root: 'a', extensions: ['.ts'] },
          },
        ],
      })[0],
    ).toMatch(/exactly one of file/);
    expect(
      validateStructureRuleManifest(
        rule([{ file: 'a.ts', requireClassPatterns: [{ pattern: '(' }] }]),
      )[0],
    ).toMatch(/valid pattern/);
    expect(
      validateStructureRuleManifest(
        rule([{ file: 'a.ts', counts: [{ kind: 'nope', name: 'x' }] }]),
      )[0],
    ).toMatch(/invalid kind/);
  });

  it('keeps the checked-in structure manifest valid and passing', () => {
    expect(validateStructureRuleManifest(manifest)).toEqual([]);
    const root = path.resolve(import.meta.dirname, '../../..');
    expect(findStructureRuleViolations(root, manifest)).toEqual([]);
  }, 120000);
});
