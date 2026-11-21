import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Knowledge write-request ownership surface (stage-6 residual 109):
 * status transitions (retry/markCommitted/markFailed) must include identityId
 * in the write filter — never mutate by bare primary key alone.
 */
describe('knowledge write request ownership surface', () => {
  const port = readFileSync(
    resolve(__dirname, '../../../../application/ports/knowledge-note-projection.repository.ts'),
    'utf8',
  );
  const prisma = readFileSync(
    resolve(__dirname, '../knowledge-write-request-prisma.repository.ts'),
    'utf8',
  );
  it('port status methods require identityId', () => {
    expect(port).toContain(
      'retryFailed(identityId: string, id: string, updatedAt: number): Promise<boolean>;',
    );
    expect(port).toContain(
      'markCommitted(identityId: string, id: string, commitSha: string): Promise<void>;',
    );
    expect(port).toContain(
      'markFailed(identityId: string, id: string, code: string, message: string): Promise<void>;',
    );
  });

  it('prisma updates filter by id + identityId', () => {
    expect(prisma).toContain(
      'async markCommitted(identityId: string, id: string, commitSha: string)',
    );
    expect(prisma).toContain(
      'async retryFailed(identityId: string, id: string, updatedAt: number)',
    );
    expect(prisma).toContain(
      'async markFailed(identityId: string, id: string, code: string, message: string)',
    );
    expect(prisma).toContain('where: { id, identityId }');
    expect(prisma).toContain("where: { id, identityId, status: 'Failed' }");
    // No bare where: { id } status updates via update/updateMany.
    expect(prisma).not.toMatch(/where:\s*\{\s*id\s*\}/);
  });
});
