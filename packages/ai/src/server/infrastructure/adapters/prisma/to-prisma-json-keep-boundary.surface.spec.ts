import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { toPrismaJson as aiToPrismaJson } from './to-prisma-json';

/**
 * Residual 1159: toPrismaJson keep-boundary (AI deep-clone vs account DTO cast).
 * - AI sole: JSON.parse(JSON.stringify(value)) → Prisma.InputJsonValue (unknown in, deep-clone)
 * - Account private: DTO cast → Prisma.InputJsonObject (typed profile/settings, no clone)
 * Soft residual 979: AI Prisma adapter duals retired onto sole.
 * Soft residual 1156: toDashboardTaskOccurrenceRecord dual retired remains separate.
 * Does not flip §13.2 checkboxes.
 */
describe('toPrismaJson keep-boundary (residual 1159)', () => {
  const dir = __dirname;
  const aiSole = readFileSync(resolve(dir, 'to-prisma-json.ts'), 'utf8');
  const account = readFileSync(
    resolve(
      dir,
      '../../../../../../account/src/server/infrastructure/adapters/prisma/account-prisma.repository.ts',
    ),
    'utf8',
  );

  it('owns Residual 1159 keep-boundary markers on AI deep-clone sole', () => {
    expect(aiSole).toContain('Residual 1159 keep-boundary');
    expect(aiSole).toMatch(/export function toPrismaJson\b/);
    expect(aiSole).toContain('JSON.parse(JSON.stringify(value))');
    expect(aiSole).toContain('Prisma.InputJsonValue');
    const body = aiSole.match(/export function toPrismaJson\([\s\S]*?\n\}/)?.[0] ?? '';
    expect(body).toContain('JSON.parse');
    expect(body).not.toContain('InputJsonObject');
    expect(body).not.toContain('as unknown as');
  });

  it('differs from account DTO cast toPrismaJson (no force-merge)', () => {
    expect(account).toContain('Residual 1159 keep-boundary');
    expect(account).toMatch(/function toPrismaJson\b/);
    expect(account).toContain('AccountProfileDTO');
    expect(account).toContain('AccountSettingsDTO');
    expect(account).toContain('Prisma.InputJsonObject');
    expect(account).toContain('Soft residual 1159');
    const body = account.match(/function toPrismaJson\([\s\S]*?\n\}/)?.[0] ?? '';
    expect(body).toContain('as unknown as Prisma.InputJsonObject');
    expect(body).not.toContain('JSON.parse');
    expect(body).not.toContain('JSON.stringify');
    expect(body).not.toContain('InputJsonValue');
  });

  it('runtime: AI deep-clone breaks referential identity', () => {
    const input = { nested: { n: 1 }, list: [1, 2] };
    const out = aiToPrismaJson(input) as { nested: { n: number }; list: number[] };
    expect(out).toEqual(input);
    expect(out).not.toBe(input);
    expect(out.nested).not.toBe(input.nested);
    expect(out.list).not.toBe(input.list);
    // mutate clone must not mutate source
    out.nested.n = 99;
    expect(input.nested.n).toBe(1);
  });

  it('documents residual 1159 lock intent without claiming §13.2 complete', () => {
    const self = readFileSync(
      resolve(dir, 'to-prisma-json-keep-boundary.surface.spec.ts'),
      'utf8',
    );
    expect(self).toContain('Residual 1159');
    expect(self).toContain('Does not flip §13.2 checkboxes');
    expect(self).toContain('keep-boundary');
  });
});
