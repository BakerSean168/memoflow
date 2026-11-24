import type { IElectronDatabase } from '@memoflow/desktop-contracts';
import {
  KnowledgeDocumentIdSchema,
  type KnowledgeDocumentId,
} from '@memoflow/repository-contracts';

export interface KnowledgeDraftDelivery {
  readonly noteId: string;
  readonly notePath: string;
  readonly noteName: string;
  readonly revision: number;
  readonly deliveredAt: number;
}
export interface KnowledgeDraftRecord {
  readonly id: string;
  readonly identityId: string;
  readonly knowledgeDocumentId: KnowledgeDocumentId;
  readonly revision: number;
  readonly title: string;
  readonly topic: string;
  readonly markdown: string;
  readonly targetSubpath: string;
  readonly tags: readonly string[];
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly delivery?: KnowledgeDraftDelivery;
}
export interface KnowledgeDraftUpdate {
  readonly title?: string;
  readonly topic?: string;
  readonly markdown?: string;
  readonly targetSubpath?: string;
  readonly tags?: readonly string[];
}

interface DraftRow {
  identity_id: string;
  id: string;
  knowledge_document_id: string;
  revision: number;
  title: string;
  topic: string;
  markdown: string;
  target_subpath: string;
  tags_json: string;
  created_at: number;
  updated_at: number;
  delivered_note_id: string | null;
  delivered_note_path: string | null;
  delivered_note_name: string | null;
  delivered_revision: number | null;
  delivered_at: number | null;
}

function toRecord(row: DraftRow): KnowledgeDraftRecord {
  const tags = JSON.parse(row.tags_json) as unknown;
  return {
    id: row.id,
    identityId: row.identity_id,
    knowledgeDocumentId: KnowledgeDocumentIdSchema.parse(row.knowledge_document_id),
    revision: row.revision,
    title: row.title,
    topic: row.topic,
    markdown: row.markdown,
    targetSubpath: row.target_subpath,
    tags: Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === 'string') : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.delivered_note_id &&
    row.delivered_note_path &&
    row.delivered_note_name &&
    row.delivered_revision &&
    row.delivered_at
      ? {
          delivery: {
            noteId: row.delivered_note_id,
            notePath: row.delivered_note_path,
            noteName: row.delivered_note_name,
            revision: row.delivered_revision,
            deliveredAt: row.delivered_at,
          },
        }
      : {}),
  };
}

/**
 * Profile-local vault drafts. A draft is not a synced business row: it is an
 * owner-bound proposal that only becomes a note through the confirmed write
 * path. Rows are identity-scoped; a foreign id is indistinguishable from miss.
 */
export class LocalKnowledgeDraftRepository {
  private ensurePromise: Promise<void> | null = null;
  constructor(private readonly db: IElectronDatabase) {}

  private ensureTable(): Promise<void> {
    if (!this.ensurePromise) {
      this.ensurePromise = this.db
        .execute(
          `
        CREATE TABLE IF NOT EXISTS local_knowledge_drafts (
          identity_id TEXT NOT NULL,
          id TEXT NOT NULL,
          knowledge_document_id TEXT NOT NULL,
          revision INTEGER NOT NULL,
          title TEXT NOT NULL,
          topic TEXT NOT NULL,
          markdown TEXT NOT NULL,
          target_subpath TEXT NOT NULL,
          tags_json TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          delivered_note_id TEXT,
          delivered_note_path TEXT,
          delivered_note_name TEXT,
          delivered_revision INTEGER,
          delivered_at INTEGER,
          PRIMARY KEY(identity_id, id)
        )
      `,
        )
        .then(() => undefined)
        .catch((error: unknown) => {
          this.ensurePromise = null;
          throw error;
        });
    }
    return this.ensurePromise;
  }

  async get(identityId: string, id: string): Promise<KnowledgeDraftRecord | null> {
    await this.ensureTable();
    const row = await this.db.getOptional<DraftRow>(
      'SELECT * FROM local_knowledge_drafts WHERE identity_id = ? AND id = ?',
      [identityId, id],
    );
    return row ? toRecord(row) : null;
  }

  async insert(record: KnowledgeDraftRecord): Promise<void> {
    await this.ensureTable();
    await this.db.execute(
      `INSERT INTO local_knowledge_drafts
        (identity_id, id, knowledge_document_id, revision, title, topic, markdown,
         target_subpath, tags_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.identityId,
        record.id,
        record.knowledgeDocumentId,
        record.revision,
        record.title,
        record.topic,
        record.markdown,
        record.targetSubpath,
        JSON.stringify(record.tags),
        record.createdAt,
        record.updatedAt,
      ],
    );
  }

  /** Revision-fenced update; a delivered or stale draft returns null. */
  async update(
    identityId: string,
    id: string,
    expectedRevision: number,
    patch: KnowledgeDraftUpdate,
    updatedAt: number,
  ): Promise<KnowledgeDraftRecord | null> {
    await this.ensureTable();
    const current = await this.get(identityId, id);
    if (!current || current.revision !== expectedRevision || current.delivery) return null;
    const next: KnowledgeDraftRecord = {
      ...current,
      title: patch.title ?? current.title,
      topic: patch.topic ?? current.topic,
      markdown: patch.markdown ?? current.markdown,
      targetSubpath: patch.targetSubpath ?? current.targetSubpath,
      tags: patch.tags ?? current.tags,
      revision: current.revision + 1,
      updatedAt,
    };
    const result = await this.db.execute(
      `UPDATE local_knowledge_drafts
          SET revision = ?, title = ?, topic = ?, markdown = ?, target_subpath = ?,
              tags_json = ?, updated_at = ?
        WHERE identity_id = ? AND id = ? AND revision = ? AND delivered_at IS NULL`,
      [
        next.revision,
        next.title,
        next.topic,
        next.markdown,
        next.targetSubpath,
        JSON.stringify(next.tags),
        next.updatedAt,
        identityId,
        id,
        expectedRevision,
      ],
    );
    return result.rowsAffected === 1 ? next : null;
  }

  /** Records the confirmed delivery for exactly one draft revision. */
  async markDelivered(
    identityId: string,
    id: string,
    revision: number,
    delivery: KnowledgeDraftDelivery,
  ): Promise<KnowledgeDraftRecord | null> {
    await this.ensureTable();
    const result = await this.db.execute(
      `UPDATE local_knowledge_drafts
          SET delivered_note_id = ?, delivered_note_path = ?, delivered_note_name = ?,
              delivered_revision = ?, delivered_at = ?
        WHERE identity_id = ? AND id = ? AND revision = ? AND delivered_at IS NULL`,
      [
        delivery.noteId,
        delivery.notePath,
        delivery.noteName,
        delivery.revision,
        delivery.deliveredAt,
        identityId,
        id,
        revision,
      ],
    );
    if (result.rowsAffected !== 1) return null;
    return this.get(identityId, id);
  }
}
