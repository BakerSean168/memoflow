import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * W6-A contract surface: the Git commit ledger and the projection operation
 * ledger must stay separate and visible through the whole client stack
 * (contract DTO -> client port -> HTTP/IPC adapters -> server application port).
 * Committed/Pending/Failed states are asserted as one shared vocabulary so the
 * UI and the server cannot drift.
 */
describe('knowledge write-request ledger client/server contract surface (W6-A)', () => {
  const dto = readFileSync(
    resolve(
      __dirname,
      '../../../repository-contracts/src/api/knowledge-note-projection.dto.ts',
    ),
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
    resolve(__dirname, '../../../repository/src/api/routes/knowledge-repository-connection.routes.ts'),
    'utf8',
  );

  it('contract exposes Committed Git commit and projection status separately', () => {
    expect(dto).toContain('status: KnowledgeWriteRequestStatusSchema');
    expect(dto).toContain('commitSha: z.string().nullable()');
    expect(dto).toContain('projectionStatus: KnowledgeWriteRequestProjectionStatusSchema');
    expect(dto).toMatch(/'Pending'[\s\S]*'Succeeded'[\s\S]*'Failed'/);
  });

  it('client port exposes list and replay for the UI to render/retry the ledger', () => {
    expect(clientPort).toContain('listKnowledgeWriteRequests(');
    expect(clientPort).toContain('replayKnowledgeWriteRequestProjection(');
  });

  it('both transports forward list/replay', () => {
    expect(httpAdapter).toContain('listKnowledgeWriteRequests(');
    expect(httpAdapter).toContain('replayKnowledgeWriteRequestProjection(');
    expect(httpAdapter).toContain('/knowledge-write-requests');
    expect(ipcAdapter).toContain('listKnowledgeWriteRequests(');
    expect(ipcAdapter).toContain('replayKnowledgeWriteRequestProjection(');
  });

  it('desktop IPC forwards list/replay through real channels instead of the unavailable stub', () => {
    expect(ipcAdapter).toContain('RepositoryChannels.KNOWLEDGE_WRITE_REQUEST_LIST');
    expect(ipcAdapter).toContain('RepositoryChannels.KNOWLEDGE_WRITE_REQUEST_REPLAY');
    // The two ledger methods must not degrade to serverProjectionUnavailable().
    const listSlice = ipcAdapter.slice(
      ipcAdapter.indexOf('listKnowledgeWriteRequests('),
      ipcAdapter.indexOf('getLocalVaultBinding()'),
    );
    expect(listSlice).not.toContain('serverProjectionUnavailable');
  });

  it('electron main registers list/replay IPC handlers over the remote connection port', () => {
    const electron = readFileSync(resolve(__dirname, '../../../repository/src/electron/index.ts'), 'utf8');
    expect(electron).toContain('RepositoryChannels.KNOWLEDGE_WRITE_REQUEST_LIST');
    expect(electron).toContain('RepositoryChannels.KNOWLEDGE_WRITE_REQUEST_REPLAY');
    expect(electron).toContain('port.listKnowledgeWriteRequests(');
    expect(electron).toContain('port.replayKnowledgeWriteRequestProjection(');
  });

  it('server application port and routes expose the same operations', () => {
    expect(appPort).toContain('listKnowledgeWriteRequests(');
    expect(appPort).toContain('replayKnowledgeWriteRequestProjection(');
    expect(routes).toContain("path: '/knowledge-write-requests'");
    expect(routes).toContain("path: '/knowledge-write-requests/:writeRequestId/replay'");
  });
});
