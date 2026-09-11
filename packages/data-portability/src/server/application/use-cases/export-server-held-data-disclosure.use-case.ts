import {
  ServerHeldDataDisclosureEnvelopeV1Schema,
  type ExportServerHeldDataDisclosureRes,
  type ServerHeldDataDisclosureEnvelopeV1,
} from '@memoflow/contracts/data-portability';
import { createLogger } from '@memoflow/utils/logger';
import type { ServerHeldDataDisclosureSource } from '../server-held-data-disclosure.source';

const logger = createLogger('ExportServerHeldDataDisclosure');

const DISCLOSURE_NOTES = [
  'This artifact is a read-only disclosure and cannot be imported into MemoFlow.',
  'GitHub installation identifiers are non-replayable references; no MemoFlow-managed OAuth token, installation access token, private key, or other replayable authorization is included.',
  'User-authored Markdown, frontmatter, and cached repository bytes are disclosed verbatim and may contain secrets the user placed in the repository.',
  'Local Vault files, local Git history, and GitHub repository history are not held in this server disclosure.',
] as const;

export class ExportServerHeldDataDisclosureUseCase {
  constructor(
    private readonly source: ServerHeldDataDisclosureSource,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(identityId: string): Promise<ExportServerHeldDataDisclosureRes> {
    const disclosedAt = this.now().toISOString();
    const data = await this.source.readForIdentity(identityId);

    const envelope: ServerHeldDataDisclosureEnvelopeV1 =
      ServerHeldDataDisclosureEnvelopeV1Schema.parse({
        // Residual 885: disclosure product surface is not-importable (Web-only export).
        kind: 'memoflow.server-held-data-disclosure',
        schemaVersion: 1,
        disclosedAt,
        subject: { identityId },
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
        data,
      });

    const entityCounts = {
      knowledgeSpaces: data.knowledgeSpaces.length,
      knowledgeRemoteBindings: data.knowledgeRemoteBindings.length,
      remoteRepositoryObservations: data.remoteRepositoryObservations.length,
      remoteHistoryFences: data.remoteHistoryFences.length,
      knowledgeProjectionCheckpoints: data.knowledgeProjectionCheckpoints.length,
      githubWebhookDeliveries: data.githubWebhookDeliveries.length,
      knowledgeNoteProjections: data.knowledgeNoteProjections.length,
      knowledgeAttachmentProjections: data.knowledgeAttachmentProjections.length,
      knowledgeAttachmentContentCaches: data.knowledgeAttachmentContentCaches.length,
      knowledgeWriteRequests: data.knowledgeWriteRequests.length,
      aiKnowledgeIndexEntries: data.aiKnowledgeIndexEntries.length,
    };
    const cachedAttachmentBytes = data.knowledgeAttachmentContentCaches.reduce(
      (total, entry) => total + entry.byteSize,
      0,
    );
    const timestamp = disclosedAt.replace(/[:.]/g, '-').slice(0, 19);
    const fileName = `memoflow-server-held-data-disclosure-v1-${timestamp}.json`;

    logger.info('Server-held data disclosure completed', {
      identityId,
      entityCounts,
      cachedAttachmentBytes,
    });

    return {
      fileName,
      content: JSON.stringify(envelope, null, 2),
      summary: {
        entityCounts,
        cachedAttachmentBytes,
        notes: [...DISCLOSURE_NOTES],
      },
    };
  }
}
