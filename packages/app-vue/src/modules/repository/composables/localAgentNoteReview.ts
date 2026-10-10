import type { ConfirmedLocalVaultWriteReq } from '@memoflow/contracts/repository';
import { KnowledgeDocumentIdSchema } from '@memoflow/contracts/repository';
import type { KnowledgeCaptureNativeEditSession } from './knowledgeCaptureNativeEditSession';

/** User-initiated capture through the existing Repository editor, without AI execution. */
export async function openLocalAgentNoteReview(options: {
  content: string;
  surface: {
    openCreate(): Promise<KnowledgeCaptureNativeEditSession>;
    locate(): KnowledgeCaptureNativeEditSession | null;
  };
  bindingId: string;
  currentBindingId(): Promise<string | null>;
  persist(
    request: ConfirmedLocalVaultWriteReq,
  ): Promise<{ note: { knowledgeDocumentId: string | null } }>;
  onSaved(documentId: string): Promise<void>;
  onError?(error: unknown): void;
}) {
  const session = await options.surface.openCreate();
  const proposalId = crypto.randomUUID();
  const knowledgeDocumentId = KnowledgeDocumentIdSchema.parse(`kdoc_${crypto.randomUUID()}`);
  const title =
    options.content
      .split('\n')
      .find((line) => line.trim())
      ?.replace(/^#+\s*/, '')
      .slice(0, 120) ?? 'Note';
  session.patch({
    title,
    topic: title,
    markdown: options.content,
    source: { kind: 'local_vault' },
    targetSubpath: `notes/${proposalId}.md`,
    tags: [],
    duplicateRisk: '',
  });
  let saving = false;
  let confirmed: ConfirmedLocalVaultWriteReq | undefined;
  session.coordinateSubmit(
    async () => {
      if (saving) return;
      saving = true;
      try {
        if (
          options.surface.locate() !== session ||
          (await options.currentBindingId()) !== options.bindingId
        )
          throw new Error('The reviewed Knowledge destination is no longer active');
        const expectedDraft = session.readDraftState().draft;
        session.setEditingBlocked(true);
        const draft = await session.requestSubmit({ expectedDraft });
        if (!draft) return;
        if (draft.source?.kind !== 'local_vault')
          throw new Error('Local Agent capture requires the selected local Vault');
        const request: ConfirmedLocalVaultWriteReq = {
          expectedBindingId: options.bindingId,
          knowledgeDocumentId,
          relativePath: draft.targetSubpath,
          contentMarkdown: draft.markdown,
          proposalId,
          proposalRevision: 1,
          requestId: proposalId,
        };
        if (confirmed && JSON.stringify(confirmed) !== JSON.stringify(request))
          throw new Error('Retry the original confirmed content before starting another review');
        confirmed = request;
        const result = await options.persist(request);
        session.setEditingBlocked(false);
        session.requestCancel();
        if (result.note.knowledgeDocumentId) await options.onSaved(result.note.knowledgeDocumentId);
      } catch (error) {
        if (options.onError) options.onError(error);
        else throw error;
      } finally {
        saving = false;
        try {
          session.setEditingBlocked(false);
        } catch {
          /* The owner may close after saving. */
        }
      }
    },
    async () => {
      if (!saving) session.requestCancel();
    },
  );
  await session.focus('title');
}
