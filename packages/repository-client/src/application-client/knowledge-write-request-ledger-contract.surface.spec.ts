import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Historical receipt vocabulary remains readable; replay and Desktop remote IPC are retired. */
describe('historical knowledge ledger and retired write transport boundary', () => {
  const dto = readFileSync(
    resolve(__dirname, '../../../repository-contracts/src/api/knowledge-note-projection.dto.ts'),
    'utf8',
  );
  const clientPort = readFileSync(
    resolve(__dirname, './ports/repository-api-client.port.ts'),
    'utf8',
  );
  const httpAdapter = readFileSync(
    resolve(__dirname, '../infrastructure-client/adapters/http/repository-http.adapter.ts'),
    'utf8',
  );
  const ipcAdapter = readFileSync(
    resolve(__dirname, '../infrastructure-client/adapters/ipc/repository-ipc.adapter.ts'),
    'utf8',
  );
  const appPort = readFileSync(
    resolve(__dirname, '../../../repository/src/server/application/repository.application.port.ts'),
    'utf8',
  );
  const routes = readFileSync(
    resolve(
      __dirname,
      '../../../repository/src/api/routes/knowledge-repository-connection.routes.ts',
    ),
    'utf8',
  );

  it('contract exposes Committed Git commit and projection status separately', () => {
    expect(dto).toContain('status: KnowledgeWriteRequestStatusSchema');
    expect(dto).toContain('commitSha: z.string().nullable()');
    expect(dto).toContain('projectionStatus: KnowledgeWriteRequestProjectionStatusSchema');
    expect(dto).toMatch(/'Pending'[\s\S]*'Succeeded'[\s\S]*'Failed'/);
  });

  it('retains receipt queries and compatibility method types', () => {
    expect(clientPort).toContain('listKnowledgeWriteRequests(');
    expect(appPort).toContain('listKnowledgeWriteRequests(');
    expect(httpAdapter).toContain('/knowledge-write-requests');
    expect(routes).toContain("path: '/knowledge-write-requests'");
  });

  it('does not register remote ledger IPC in the local Desktop runtime', () => {
    const electron = readFileSync(
      resolve(__dirname, '../../../repository/src/electron/index.ts'),
      'utf8',
    );
    for (const channel of ['KNOWLEDGE_WRITE_REQUEST_LIST', 'KNOWLEDGE_WRITE_REQUEST_REPLAY']) {
      expect(electron).not.toContain(`RepositoryChannels.${channel}`);
      expect(ipcAdapter).not.toContain(`RepositoryChannels.${channel}`);
    }
    expect(electron).toContain('RepositoryChannels.LOCAL_VAULT_WRITES');
  });

  it('does not expose the retired replay endpoint', () => {
    expect(routes).not.toContain("path: '/knowledge-write-requests/:writeRequestId/replay'");
    expect(httpAdapter).not.toContain('/replay`');
    expect(httpAdapter).toContain('knowledgeSourceReadOnly');
  });
});
