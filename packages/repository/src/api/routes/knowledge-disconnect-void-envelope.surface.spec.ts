import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Knowledge disconnect void-success envelope (stage-6 residual 95):
 * disconnect uses z.null()/ok(null) — no { disconnected: true } dual-track body.
 */
describe('knowledge disconnect void success envelope surface', () => {
  const routes = readFileSync(
    resolve(__dirname, './knowledge-repository-connection.routes.ts'),
    'utf8',
  );
  const controller = readFileSync(
    resolve(__dirname, '../../server/transport/knowledge-repository-connection.controller.ts'),
    'utf8',
  );
  const service = readFileSync(
    resolve(
      __dirname,
      '../../server/application/services/knowledge-repository-connection.service.ts',
    ),
    'utf8',
  );
  const electron = readFileSync(resolve(__dirname, '../../electron/index.ts'), 'utf8');
  const dto = readFileSync(
    resolve(
      __dirname,
      '../../../../contracts/src/modules/repository/api/knowledge-repository-connection.dto.ts',
    ),
    'utf8',
  );

  it('contracts/OpenAPI disconnect response is null, not disconnected:true', () => {
    expect(dto).toContain(
      'export const DisconnectKnowledgeRepositoryConnectionResponseSchema = z.null()',
    );
    expect(dto).toContain('export type DisconnectKnowledgeRepositoryConnectionRes = null');
    expect(dto).not.toContain('disconnected: z.literal(true)');
    expect(routes).toContain('DisconnectKnowledgeRepositoryConnectionResponseSchema');
  });

  it('service/controller/electron normalize disconnect to ok(null)', () => {
    expect(service).toContain('Promise<Result<null>>');
    expect(service).toContain('return ok(null)');
    expect(service).not.toContain('disconnected: true');
    expect(controller).toMatch(/async disconnect[\s\S]*?Promise<Result<null>>/);
    expect(controller).toContain('return ok(null)');
    expect(electron).toContain('RepositoryChannels.KNOWLEDGE_CONNECTION_DISCONNECT');
    expect(electron).toContain('return ok(null)');
  });
});
