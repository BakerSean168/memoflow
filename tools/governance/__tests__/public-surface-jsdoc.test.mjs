/**
 * Public-surface JSDoc audit mutation fixtures (RefArch Phase 6).
 * 公共表面 JSDoc 审计 mutation fixtures（RefArch 阶段 6）。
 *
 * Positive fixture: the real audited surfaces pass. Mutated negative fixtures:
 * deleting the 中文 half, dropping @param/@returns/@typeParam, or removing a
 * JSDoc block entirely turns the audit red.
 *
 * Positive fixture：真实审计表面通过。Mutated negative fixtures：删除中文一半、
 * 去掉 @param/@returns/@typeParam 或整个移除 JSDoc 块都会让审计变红。
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const AUDIT_SCRIPT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'public-surface-jsdoc-audit.mjs',
);

function runAudit(root, paths) {
  const result = spawnSync(process.execPath, [AUDIT_SCRIPT], {
    env: {
      ...process.env,
      PUBLIC_SURFACE_JSDOC_ROOT: root,
      PUBLIC_SURFACE_JSDOC_PATHS: paths.join(','),
    },
    encoding: 'utf8',
  });
  return { status: result.status, output: `${result.stdout}\n${result.stderr}` };
}

function createTempRoot(files) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'jsdoc-surface-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(root, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}

const OK_SOURCE = `/**
 * Resolves the bounded route template.
 * 解析有界的 route template。
 *
 * @param req - The Express request.
 * @returns The bounded template.
 */
export function resolveRouteTemplate(req: { route?: { path?: string } }): string {
  return req.route?.path ?? '__unmatched__';
}

/**
 * Generic server module handle.
 * 通用 server 模块 handle。
 *
 * @typeParam TContext - The registration context.
 */
export interface ServerModuleHandle<TContext extends object> {
  readonly name: string;
}`;

const MUTATED_NO_CHINESE = `/**
 * Resolves the bounded route template.
 *
 * @param req - The Express request.
 * @returns The bounded template.
 */
export function resolveRouteTemplate(req: { route?: { path?: string } }): string {
  return req.route?.path ?? '__unmatched__';
}`;

const MUTATED_NO_RETURNS = `/**
 * Resolves the bounded route template.
 * 解析有界的 route template。
 *
 * @param req - The Express request.
 */
export function resolveRouteTemplate(req: { route?: { path?: string } }): string {
  return req.route?.path ?? '__unmatched__';
}`;

const MUTATED_NO_TYPEPARAM = `/**
 * Generic server module handle.
 * 通用 server 模块 handle。
 */
export interface ServerModuleHandle<TContext extends object> {
  readonly name: string;
}`;

const MUTATED_NO_JS_DOC = `export function resolveRouteTemplate(req: { route?: { path?: string } }): string {
  return req.route?.path ?? '__unmatched__';
}`;

describe('public-surface-jsdoc-audit (positive real-code run)', () => {
  it('passes against the real audited surfaces', () => {
    const result = runAudit(
      path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..'),
      [
        'packages/host-runtime/src/server-module-context.ts',
        'apps/api/src/shared/infrastructure/observability/http-request-observation.ts',
        'tools/governance/lib/architecture-surface.mjs',
      ],
    );
    expect(result.status).toBe(0);
  }, 120000);
});

describe('public-surface-jsdoc-audit (mutated negative fixtures)', () => {
  it('deleting the 中文 half of a JSDoc goes red', () => {
    const root = createTempRoot({ 'surface.ts': MUTATED_NO_CHINESE });
    try {
      const result = runAudit(root, ['surface.ts']);
      expect(result.status).toBe(1);
      expect(result.output).toMatch(/English and 中文/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('dropping @returns from a value-returning function goes red', () => {
    const root = createTempRoot({ 'surface.ts': MUTATED_NO_RETURNS });
    try {
      const result = runAudit(root, ['surface.ts']);
      expect(result.status).toBe(1);
      expect(result.output).toMatch(/missing @returns/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('dropping @typeParam from a generic goes red', () => {
    const root = createTempRoot({ 'surface.ts': MUTATED_NO_TYPEPARAM });
    try {
      const result = runAudit(root, ['surface.ts']);
      expect(result.status).toBe(1);
      expect(result.output).toMatch(/missing @typeParam/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('removing a JSDoc block entirely goes red', () => {
    const root = createTempRoot({ 'surface.ts': MUTATED_NO_JS_DOC });
    try {
      const result = runAudit(root, ['surface.ts']);
      expect(result.status).toBe(1);
      expect(result.output).toMatch(/has no JSDoc/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('the complete bilingual fixture passes', () => {
    const root = createTempRoot({ 'surface.ts': OK_SOURCE });
    try {
      const result = runAudit(root, ['surface.ts']);
      expect(result.status).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
