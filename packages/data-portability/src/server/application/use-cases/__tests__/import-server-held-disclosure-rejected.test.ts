import { describe, expect, it, vi } from 'vitest';
import { ResultErrorException } from '@memoflow/contracts/result';
import { ImportUserDataUseCase } from '../import-user-data.use-case';
import type { DataPortabilityImportStore } from '../../import-store/data-portability-import-store';

describe('ImportUserDataUseCase rejects server-held disclosure (residual 106)', () => {
  it('fails closed when content is a memoflow.server-held-data-disclosure envelope', async () => {
    const importStore = {
      transaction: vi.fn(),
    } as unknown as DataPortabilityImportStore;
    const useCase = new ImportUserDataUseCase(importStore);

    const disclosure = {
      kind: 'memoflow.server-held-data-disclosure',
      schemaVersion: 1,
      disclosedAt: '2026-07-20T00:00:00.000Z',
      subject: { identityId: 'identity-1' },
      scope: {
        importMode: 'not-importable',
        includesImportableBusinessDataBackup: false,
        includesLocalVaultFiles: false,
        includesGithubRepositoryHistory: false,
        includesApplicationManagedReplayableGithubAuthorization: false,
        includesNonReplayableGithubInstallationIdentifiers: true,
        includesCachedAttachmentBytes: true,
        includesEphemeralWorkerLeases: false,
        includesDatabaseInternalRetrievalVector: false,
      },
      data: {
        knowledgeSpaces: [],
        knowledgeRemoteBindings: [],
        remoteRepositoryObservations: [],
        remoteHistoryFences: [],
        knowledgeProjectionCheckpoints: [],
        githubWebhookDeliveries: [],
        knowledgeNoteProjections: [],
        knowledgeAttachmentProjections: [],
        knowledgeAttachmentContentCaches: [],
        knowledgeWriteRequests: [],
        aiKnowledgeIndexEntries: [],
      },
    };

    await expect(useCase.execute('identity-1', JSON.stringify(disclosure))).rejects.toBeInstanceOf(
      ResultErrorException,
    );

    await expect(useCase.execute('identity-1', JSON.stringify(disclosure))).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      message: expect.stringMatching(/not importable/i),
    });

    expect(importStore.transaction).not.toHaveBeenCalled();
  });

  it('fails closed for dryRun as well (no partial import path)', async () => {
    const importStore = {
      transaction: vi.fn(),
    } as unknown as DataPortabilityImportStore;
    const useCase = new ImportUserDataUseCase(importStore);

    await expect(
      useCase.execute(
        'identity-1',
        JSON.stringify({
          kind: 'memoflow.server-held-data-disclosure',
          schemaVersion: 1,
        }),
        true,
      ),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      message: expect.stringMatching(/server-held data disclosure/i),
    });
    expect(importStore.transaction).not.toHaveBeenCalled();
  });
});
