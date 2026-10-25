import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Weight snapshot ownership surface (stage-6 residual 149/173):
 * snapshot list/get/delete paths must never authorize by bare goal/KR/id alone.
 * Residual 173 collapses dual findById.
 */
describe('weight snapshot ownership surface', () => {
  const port = readFileSync(
    resolve(__dirname, '../../../../domain/repositories/i-weight-snapshot-repository.ts'),
    'utf8',
  );
  const prisma = readFileSync(
    resolve(__dirname, '../weight-snapshot-prisma.repository.ts'),
    'utf8',
  );

  it('port drops bare findById dual method (residual 173)', () => {
    expect(port).not.toContain('findById(id: string): Promise<KeyResultWeightSnapshot | null>;');
    expect(prisma).not.toMatch(/async findById\(id: string\)/);
  });

  it('port query/delete methods require identityId (residual 149)', () => {
    expect(port).toMatch(/findByGoal\(\s*identityId: string,\s*goalId: string,/);
    expect(port).toMatch(/findByKeyResult\(\s*identityId: string,\s*keyResultId: string,/);
    expect(port).toMatch(/findByTimeRange\(\s*identityId: string,\s*startTime: number,/);
    expect(port).toContain(
      'findByIdForIdentity(identityId: string, id: string): Promise<KeyResultWeightSnapshot | null>;',
    );
    expect(port).toContain('delete(identityId: string, id: string): Promise<void>;');
    expect(port).toContain('deleteByGoal(identityId: string, goalId: string): Promise<void>;');
    expect(port).toContain(
      'deleteByKeyResult(identityId: string, keyResultId: string): Promise<void>;',
    );
  });

  it('prisma filters by identityId', () => {
    expect(prisma).toContain('where: { identityId, goalId }');
    expect(prisma).toContain('where: { identityId, keyResultId }');
    expect(prisma).toContain('async findByIdForIdentity(');
    expect(prisma).toContain('where: { id, identityId }');
    expect(prisma).toContain('deleteMany({');
    expect(prisma).toContain(
      "throw new Error('Weight snapshot not found for the current identity.');",
    );
  });
});
