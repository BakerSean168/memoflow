import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('KNOW-2003 single Knowledge projection engine surface', () => {
  const servicesDir = __dirname;
  const engine = readFileSync(resolve(servicesDir, 'knowledge-projection.engine.ts'), 'utf8');
  const commitService = readFileSync(
    resolve(servicesDir, 'knowledge-note-commit.service.ts'),
    'utf8',
  );
  const projectionService = readFileSync(
    resolve(servicesDir, 'knowledge-repository-projection.service.ts'),
    'utf8',
  );
  const prismaComposer = readFileSync(
    resolve(servicesDir, '../../infrastructure/prisma.ts'),
    'utf8',
  );

  it('keeps projection persistence writes inside KnowledgeProjectionEngine only', () => {
    expect(engine).toContain('projectionRepository.applyChanges');
    expect(engine).toContain('projectionRepository.applySnapshot');
    expect(engine).toContain('attachmentRepository.applyChanges');
    expect(engine).toContain('attachmentRepository.applySnapshot');
    for (const caller of [commitService, projectionService]) {
      expect(caller).not.toContain('projectionRepository.applyChanges');
      expect(caller).not.toContain('projectionRepository.applySnapshot');
      expect(caller).not.toContain('attachmentRepository.applyChanges');
      expect(caller).not.toContain('attachmentRepository.applySnapshot');
    }
  });

  it('routes confirmed commits, webhook changes and reconciliation snapshots through the engine', () => {
    expect(commitService.match(/projectionEngine\.applyChanges/g)).toHaveLength(2);
    expect(projectionService).toContain('this.projectionEngine.applyChanges');
    expect(projectionService.match(/this\.projectionEngine\.applySnapshot/g)).toHaveLength(2);
  });

  it('shares one production engine instance across commit and projection runtime services', () => {
    expect(prismaComposer.match(/new KnowledgeProjectionEngine\(/g)).toHaveLength(1);
    expect(prismaComposer.match(/projectionEngine: knowledgeProjectionEngine/g)).toHaveLength(2);
  });
});
