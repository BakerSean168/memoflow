/**
 * RefArch Phase 2 canonical Request/Execution Context suite.
 *
 * Relocated with its subject in P1 S2 (Issue #633): the canonical
 * ExecutionContext body moved from packages/contracts/src/shared to
 * @memoflow/transport-contracts, so these assertions — preserved verbatim
 * from contracts' dual-registry.surface.spec.ts, only the canonical path,
 * the repo-root depth and the barrel under test changed with the move —
 * now live beside the code they guard. The "shared barrel" case below reads
 * this package's src/index.ts, which re-exports the canonical types once.
 */
import { readFileSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// --- RefArch Phase 2: canonical Request/Execution Context contracts ---
{
  /**
   * Phase 2 freezes `packages/transport-contracts/src/execution-context.ts` as the
   * only `ExecutionContext` body. `context.ts` keeps a deprecated alias only;
   * the legacy feature-private copy is retired in the adapter rollout. The context
   * stays metadata-only — no Prisma/repository/business-aggregate fields.
   */
  const here = dirname(fileURLToPath(import.meta.url));

  /**
   * Forbidden-field inventory, matched case-insensitively against the stripped
   * type body so camelCase tokens (`emailVerified`, `sessionId`) can never hide
   * a false negative. Shared by the real check and the mutation fixtures.
   */
  const forbiddenContextFieldTokens = [
    'prisma',
    'repository',
    'authorization',
    'emailverified',
    'sessionid',
    'approval',
    'aggregate',
  ];

  function stripContextSource(source: string): string {
    // Strip block and line comments so prose about the forbidden tokens does
    // not fail the type-body inventory.
    return source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '')
      .toLowerCase();
  }

  /**
   * The single real detector used by BOTH the negative inventory check and the
   * mutation fixtures: it scans a source body with the real
   * `forbiddenContextFieldTokens` inventory. The mutation fixtures must fail
   * whenever a forbidden field is removed from that inventory.
   * 唯一的真实检测器，负向 inventory 检查与 mutation fixtures 共用：用真实的
   * `forbiddenContextFieldTokens` 扫描源码正文。任一 forbidden field 从该
   * inventory 中移除时，mutation fixtures 必须失败。
   */
  function detectForbiddenContextFields(source: string): string[] {
    const body = stripContextSource(source);
    return forbiddenContextFieldTokens.filter((token) => body.includes(token));
  }

  describe('RefArch Phase 2 canonical Request/Execution Context (unique body)', () => {
    it('execution-context.ts owns the single ExecutionContext interface body', () => {
      const source = readFileSync(join(here, 'execution-context.ts'), 'utf8');
      expect(source).toContain('ExecutionSource');
      expect(source).toContain('RequestContext');
      expect(source).toContain('interface ExecutionContext extends RequestContext');
      expect(source).toContain('requestId: string;');
      expect(source).toContain('traceId: string;');
      expect(source).toContain('startedAt: number;');
      expect(source).toContain('source: ExecutionSource;');
      expect(source).toContain('agentRunId?: string');
      expect(source).toContain('threadId?: string');
      expect(source).toContain('checkpointId?: string');
      expect(source).toMatch(/export type Context = ExecutionContext;/);
    });

    it('context.ts declares no duplicate interface body — alias only', () => {
      const source = readFileSync(join(here, 'context.ts'), 'utf8');
      expect(source).toMatch(/export type Context = ExecutionContext;/);
      expect(source).not.toMatch(/interface Context\b/);
      expect(source).not.toMatch(/interface ExecutionContext\b/);
      expect(source).toContain('@deprecated');
    });

    it('metadata-only forbidden inventory: no transport/auth/business fields', () => {
      const source = readFileSync(join(here, 'execution-context.ts'), 'utf8');
      expect(detectForbiddenContextFields(source)).toEqual([]);
    });

    it('mutation fixtures: every forbidden field (including camelCase spellings) is caught by the REAL inventory', () => {
      const original = readFileSync(join(here, 'execution-context.ts'), 'utf8');
      // One mutation per forbidden field, spelled as it would appear in a real
      // type body. Each must be detected by the real case-insensitive inventory
      // (the same detector the negative check above uses) — proving
      // `emailVerified`/`sessionId` etc. are not false negatives.
      const fixtures: Record<string, string> = {
        prisma: 'readonly prisma: unknown;',
        repository: 'readonly repository: unknown;',
        authorization: 'readonly authorization: unknown;',
        emailVerified: 'readonly emailVerified: boolean;',
        sessionId: 'readonly sessionId?: string;',
        approval: 'readonly approvalState?: unknown;',
        aggregate: 'readonly aggregate: unknown;',
      };
      for (const [field, declaration] of Object.entries(fixtures)) {
        // The fixture field must still be part of the REAL forbidden inventory:
        // removing a token from `forbiddenContextFieldTokens` must fail this
        // suite, never silently shrink coverage.
        expect(forbiddenContextFieldTokens).toContain(field.toLowerCase());
        // The real detector must flag the injected forbidden field in a mutated
        // source (mutation-of-source assertion against the real inventory).
        const mutated = `${original}\nexport interface ForbiddenProbeFixture { ${declaration} }`;
        expect(detectForbiddenContextFields(mutated)).toContain(field.toLowerCase());
        // And the real type body must stay free of the field.
        expect(detectForbiddenContextFields(original)).not.toContain(field.toLowerCase());
      }
    });

    it('shared barrel re-exports the canonical types once', () => {
      const index = readFileSync(join(here, 'index.ts'), 'utf8');
      expect(index).toContain(
        "export type { ExecutionContext, ExecutionSource, RequestContext } from './execution-context'",
      );
      expect(index).toContain("export type { Context } from './context'");
    });
  });
}

// --- RefArch Phase 2: repo-wide fail-closed context inventory ---
{
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

  async function productionTypeScriptFiles(dir: string): Promise<string[]> {
    const out: string[] = [];
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (dir === root && !['apps', 'packages', 'scripts', 'tools'].includes(entry.name)) {
        continue;
      }
      if (entry.name.startsWith('.')) {
        continue;
      }
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') {
        continue;
      }
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (
          entry.name === 'generated' ||
          entry.name === '__tests__' ||
          entry.name === '__fixtures__'
        ) {
          continue;
        }
        out.push(...(await productionTypeScriptFiles(full)));
      } else if (
        /\.(ts|tsx)$/.test(entry.name) &&
        !/\.(spec|test|surface)\.tsx?$/.test(entry.name)
      ) {
        out.push(full);
      }
    }
    return out;
  }

  describe('RefArch Phase 2 fail-closed context inventory (repo-wide)', () => {
    it('has no second ExecutionContext/Context interface body outside the canonical file', async () => {
      const files = await productionTypeScriptFiles(root);
      const violators: string[] = [];
      for (const file of files) {
        if (file.endsWith('/packages/transport-contracts/src/execution-context.ts')) {
          continue;
        }
        const source = await readFile(file, 'utf8');
        if (/interface\s+ExecutionContext\b/.test(source) || /interface\s+Context\b/.test(source)) {
          violators.push(file);
        }
      }
      expect(violators).toEqual([]);
    });

    it('has no identity-only `as ExecutionContext` / `as Context` casts in production code', async () => {
      const files = await productionTypeScriptFiles(root);
      const violators: string[] = [];
      for (const file of files) {
        const source = await readFile(file, 'utf8');
        if (
          /as\s+ExecutionContext\b/.test(source) ||
          /as\s+Context\b/.test(source) ||
          /\{\s*identityId:[\s\S]{0,60}\}\s*as\s+ExecutionContext/.test(source)
        ) {
          violators.push(file);
        }
      }
      expect(violators).toEqual([]);
    });

    it('has no adapter-local request-ID correlation producers (routes mint IDs instead of reading cx.requestId)', async () => {
      const files = await productionTypeScriptFiles(root);
      const violators: string[] = [];
      for (const file of files) {
        if (!/\/api\/routes\//.test(file)) {
          continue;
        }
        const source = await readFile(file, 'utf8');
        if (/const\s+requestId\s*=\s*(randomUUID|createAIRequestId)\s*\(/.test(source)) {
          violators.push(file);
        }
      }
      expect(violators).toEqual([]);
    });
  });
}
