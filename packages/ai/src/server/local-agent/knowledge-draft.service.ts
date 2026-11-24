import { randomUUID } from 'node:crypto';
import { GatewayReadError } from '@memoflow/agent-gateway';
import {
  KnowledgeDraftCreateInputSchema,
  KnowledgeDraftDeliverInputSchema,
  KnowledgeDraftGetInputSchema,
  KnowledgeDraftUpdateInputSchema,
  KnowledgeDraftSchema,
  KnowledgeDraftDeliverReceiptSchema,
  type KnowledgeDraftCreateInput,
  type KnowledgeDraftDeliverReceipt,
  type KnowledgeDraftUpdateInput,
  type KnowledgeDraftView,
} from '@memoflow/ai-contracts';
import { KnowledgeDocumentIdSchema } from '@memoflow/repository-contracts';
import type { ExecutionContext } from '@memoflow/transport-contracts';
import type { IKnowledgeNotePersistencePort } from '../application/ports';
import type {
  KnowledgeDraftRecord,
  LocalKnowledgeDraftRepository,
} from '../infrastructure/adapters/powersync/local-knowledge-draft.repository';

function toDraft(record: KnowledgeDraftRecord): KnowledgeDraftView {
  const draft = KnowledgeDraftSchema.parse({
    title: record.title,
    topic: record.topic,
    markdown: record.markdown,
    targetSubpath: record.targetSubpath,
    tags: [...record.tags],
    knowledgeDocumentId: record.knowledgeDocumentId,
    source: { kind: 'local_vault' },
    revision: record.revision,
  });
  return { ...draft, id: record.id };
}

function normalizeSubpath(value: string): string {
  return value
    .replace(/\\/g, '/')
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join('/');
}

function safeFileName(title: string): string {
  const base = title
    .replace(/\.md$/i, '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .trim();
  return `${base || 'Note'}.md`;
}

/**
 * Owner service for the Local MCP knowledge draft flow.
 *
 * Drafts never touch the Vault. Only `deliver` calls the canonical
 * `IKnowledgeNotePersistencePort.createKnowledgeNote`, which on Desktop is the
 * already-reviewed confirmed-write path (proposal id/revision/request id).
 * Revision checks make concurrent edits fail closed, and the deterministic
 * request id makes an approve retry replay the same durable write.
 */
export class LocalKnowledgeDraftService {
  constructor(
    private readonly drafts: LocalKnowledgeDraftRepository,
    private readonly notes: IKnowledgeNotePersistencePort,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async create(identityId: string, input: KnowledgeDraftCreateInput): Promise<KnowledgeDraftView> {
    const parsed = KnowledgeDraftCreateInputSchema.parse(input);
    const id = `draft_${randomUUID()}`;
    const knowledgeDocumentId = KnowledgeDocumentIdSchema.parse(`kdoc_${randomUUID()}`);
    const timestamp = this.now();
    const record: KnowledgeDraftRecord = {
      id,
      identityId,
      knowledgeDocumentId,
      revision: 1,
      title: parsed.title,
      topic: parsed.topic ?? parsed.title,
      markdown: parsed.markdown,
      targetSubpath: parsed.targetSubpath
        ? normalizeSubpath(parsed.targetSubpath)
        : `notes/${id}.md`,
      tags: parsed.tags,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await this.drafts.insert(record);
    return toDraft(record);
  }

  async get(identityId: string, input: unknown): Promise<KnowledgeDraftView | null> {
    const { id } = KnowledgeDraftGetInputSchema.parse(input);
    const record = await this.drafts.get(identityId, id);
    return record ? toDraft(record) : null;
  }

  async update(identityId: string, input: KnowledgeDraftUpdateInput): Promise<KnowledgeDraftView> {
    const parsed = KnowledgeDraftUpdateInputSchema.parse(input);
    const record = await this.drafts.update(
      identityId,
      parsed.id,
      parsed.expectedRevision,
      {
        ...parsed.changes,
        ...(parsed.changes.targetSubpath
          ? { targetSubpath: normalizeSubpath(parsed.changes.targetSubpath) }
          : {}),
      },
      this.now(),
    );
    if (!record) {
      const current = await this.drafts.get(identityId, parsed.id);
      if (!current) throw new GatewayReadError('NOT_FOUND');
      throw new GatewayReadError('CONFLICT');
    }
    return toDraft(record);
  }

  async deliver(
    identityId: string,
    input: unknown,
    context: ExecutionContext,
  ): Promise<KnowledgeDraftDeliverReceipt> {
    const parsed = KnowledgeDraftDeliverInputSchema.parse(input);
    const record = await this.drafts.get(identityId, parsed.id);
    if (!record) throw new GatewayReadError('NOT_FOUND');
    if (record.delivery) {
      if (record.delivery.revision !== parsed.expectedRevision)
        throw new GatewayReadError('CONFLICT');
      return KnowledgeDraftDeliverReceiptSchema.parse({
        draftId: record.id,
        knowledgeDocumentId: record.knowledgeDocumentId,
        revision: record.delivery.revision,
        noteId: record.delivery.noteId,
        notePath: record.delivery.notePath,
        noteName: record.delivery.noteName,
      });
    }
    if (record.revision !== parsed.expectedRevision) throw new GatewayReadError('CONFLICT');

    const { note } = await this.notes.createKnowledgeNote({
      identityId,
      context,
      source: { kind: 'local_vault' },
      knowledgeDocumentId: record.knowledgeDocumentId,
      fileName: safeFileName(record.title),
      path: record.targetSubpath,
      content: record.markdown,
      proposalId: record.id,
      proposalRevision: record.revision,
      requestId: `knowledge-draft:${record.id}:${record.revision}`,
    });

    const marked = await this.drafts.markDelivered(identityId, record.id, record.revision, {
      noteId: note.id,
      notePath: note.path,
      noteName: note.name,
      revision: record.revision,
      deliveredAt: this.now(),
    });
    const delivered = marked?.delivery;
    if (!delivered || delivered.revision !== record.revision)
      throw new GatewayReadError('CONFLICT');

    return KnowledgeDraftDeliverReceiptSchema.parse({
      draftId: record.id,
      knowledgeDocumentId: record.knowledgeDocumentId,
      revision: delivered.revision,
      noteId: delivered.noteId,
      notePath: delivered.notePath,
      noteName: delivered.noteName,
    });
  }
}
