import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { IElectronDatabase, IElectronDatabaseTransaction } from '@memoflow/contracts/electron';
import {
  AssistantRuntimeMessageViewSchema,
  AssistantRuntimeChoiceSchema,
  type AssistantRuntimeChoice,
  LocalAgentConnectionInputSchema,
  LocalAgentConnectionSchema,
  LocalAgentConversationCreateSchema,
  LocalAgentConversationSchema,
  type AssistantRuntimeMessageView,
  type LocalAgentConnectionInput,
  type LocalAgentConnection,
  type LocalAgentConversationCreate,
} from '@memoflow/contracts/ai';
import { LocalAgentError } from '../../../../shared/local-agent-error';

const StoredConversationSchema = LocalAgentConversationSchema.extend({
  connectionFingerprint: z.string().min(1),
  nativeSessionId: z.string().min(1).nullable(),
  accountFingerprint: z.string().min(1).nullable().default(null),
});
export type StoredLocalConversation = z.infer<typeof StoredConversationSchema>;
const StoredMessageSchema = AssistantRuntimeMessageViewSchema.extend({ complete: z.boolean() });
const rowSchema = z.object({ record_json: z.string() });
type LocalTable = 'ai_local_agent_connections' | 'ai_local_conversations';

function decode<T>(row: unknown, schema: z.ZodType<T>): T {
  return schema.parse(JSON.parse(rowSchema.parse(row).record_json));
}
function connectionFingerprint(connection: LocalAgentConnection) {
  return createHash('sha256')
    .update(
      JSON.stringify([connection.driver, connection.executablePath, connection.homePath ?? null]),
    )
    .digest('hex');
}

/** Profile-scoped local records. Native checkpoints and credentials are never copied here. */
export class LocalAgentRepository {
  constructor(private readonly db: IElectronDatabase) {}

  private async read<T>(
    table: LocalTable,
    owner: string,
    id: string,
    schema: z.ZodType<T>,
    tx: IElectronDatabaseTransaction = this.db,
  ): Promise<T> {
    const row = await tx.getOptional<unknown>(
      `SELECT record_json FROM ${table} WHERE id = ? AND identity_id = ?`,
      [id, owner],
    );
    if (!row) throw new LocalAgentError('NOT_FOUND');
    return decode(row, schema);
  }

  async listConnections(owner: string): Promise<LocalAgentConnection[]> {
    const rows = await this.db.getAll<unknown>(
      'SELECT record_json FROM ai_local_agent_connections WHERE identity_id = ? ORDER BY id LIMIT 100',
      [owner],
    );
    return rows.map((row) => decode(row, LocalAgentConnectionSchema));
  }
  getConnection(
    owner: string,
    id: string,
    tx?: IElectronDatabaseTransaction,
  ): Promise<LocalAgentConnection> {
    return this.read('ai_local_agent_connections', owner, id, LocalAgentConnectionSchema, tx);
  }
  async getDefaultChoice(owner: string): Promise<AssistantRuntimeChoice> {
    const connection = (await this.listConnections(owner)).find((value) => value.defaultModelId);
    return connection?.defaultModelId
      ? {
          runtimeKind: 'local_agent',
          connectionId: connection.id,
          modelId: connection.defaultModelId,
        }
      : { runtimeKind: 'builtin' };
  }
  async setDefaultChoice(owner: string, input: AssistantRuntimeChoice): Promise<void> {
    const choice = AssistantRuntimeChoiceSchema.parse(input);
    await this.db.writeTransaction(async (tx) => {
      if (choice.runtimeKind === 'local_agent') {
        await this.read(
          'ai_local_agent_connections',
          owner,
          choice.connectionId,
          LocalAgentConnectionSchema,
          tx,
        );
      }
      const rows = await tx.getAll<unknown>(
        'SELECT record_json FROM ai_local_agent_connections WHERE identity_id = ?',
        [owner],
      );
      for (const row of rows) {
        const connection = decode(row, LocalAgentConnectionSchema);
        const defaultModelId =
          choice.runtimeKind === 'local_agent' && choice.connectionId === connection.id
            ? choice.modelId
            : undefined;
        await tx.execute(
          'UPDATE ai_local_agent_connections SET record_json = ? WHERE id = ? AND identity_id = ?',
          [JSON.stringify({ ...connection, defaultModelId }), connection.id, owner],
        );
      }
    });
  }
  async createConnection(
    owner: string,
    input: LocalAgentConnectionInput,
  ): Promise<LocalAgentConnection> {
    const now = Date.now();
    const connection = LocalAgentConnectionSchema.parse({
      ...LocalAgentConnectionInputSchema.parse(input),
      id: randomUUID(),
      revision: 1,
      createdAt: now,
      updatedAt: now,
    });
    await this.db.execute(
      'INSERT INTO ai_local_agent_connections (id, identity_id, record_json) VALUES (?, ?, ?)',
      [connection.id, owner, JSON.stringify(connection)],
    );
    return connection;
  }
  async updateConnection(
    owner: string,
    id: string,
    expectedRevision: number,
    input: LocalAgentConnectionInput,
  ): Promise<LocalAgentConnection> {
    const parsed = LocalAgentConnectionInputSchema.parse(input);
    return this.db.writeTransaction(async (tx) => {
      const previous = await this.read(
        'ai_local_agent_connections',
        owner,
        id,
        LocalAgentConnectionSchema,
        tx,
      );
      if (previous.revision !== expectedRevision) throw new LocalAgentError('CONFLICT');
      const next = LocalAgentConnectionSchema.parse({
        ...previous,
        ...parsed,
        homePath: parsed.homePath,
        revision: previous.revision + 1,
        updatedAt: Date.now(),
      });
      await tx.execute(
        'UPDATE ai_local_agent_connections SET record_json = ? WHERE id = ? AND identity_id = ?',
        [JSON.stringify(next), id, owner],
      );
      return next;
    });
  }
  async deleteConnection(owner: string, id: string): Promise<void> {
    await this.db.execute(
      'DELETE FROM ai_local_agent_connections WHERE id = ? AND identity_id = ?',
      [id, owner],
    );
  }
  async createConversation(
    owner: string,
    input: LocalAgentConversationCreate,
  ): Promise<StoredLocalConversation> {
    const parsed = LocalAgentConversationCreateSchema.parse(input);
    return this.db.writeTransaction(async (tx) => {
      const connection = await this.read(
        'ai_local_agent_connections',
        owner,
        parsed.connectionId,
        LocalAgentConnectionSchema,
        tx,
      );
      if (!connection.enabled) throw new LocalAgentError('LOCAL_AGENT_UNAVAILABLE');
      const now = Date.now();
      const conversation = StoredConversationSchema.parse({
        ...parsed,
        id: randomUUID(),
        runtimeKind: 'local_agent',
        driver: connection.driver,
        connectionFingerprint: connectionFingerprint(connection),
        nativeSessionId: null,
        createdAt: now,
        updatedAt: now,
      });
      await tx.execute(
        'INSERT INTO ai_local_conversations (id, identity_id, record_json) VALUES (?, ?, ?)',
        [conversation.id, owner, JSON.stringify(conversation)],
      );
      return conversation;
    });
  }
  getConversation(owner: string, id: string): Promise<StoredLocalConversation> {
    return this.read('ai_local_conversations', owner, id, StoredConversationSchema);
  }
  async listConversations(owner: string): Promise<StoredLocalConversation[]> {
    const rows = await this.db.getAll<unknown>(
      'SELECT record_json FROM ai_local_conversations WHERE identity_id = ? ORDER BY id LIMIT 1000',
      [owner],
    );
    return rows
      .map((row) => decode(row, StoredConversationSchema))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }
  async resolveConversation(owner: string, id: string) {
    const conversation = await this.getConversation(owner, id);
    const connection = await this.getConnection(owner, conversation.connectionId);
    if (!connection.enabled) throw new LocalAgentError('LOCAL_AGENT_UNAVAILABLE');
    if (conversation.connectionFingerprint !== connectionFingerprint(connection))
      throw new LocalAgentError('LOCAL_AGENT_SESSION_UNAVAILABLE');
    return { conversation, connection };
  }
  async bindSession(
    owner: string,
    id: string,
    nativeSessionId: string,
    accountFingerprint?: string,
    modelId?: string,
  ): Promise<void> {
    await this.db.writeTransaction(async (tx) => {
      const conversation = await this.read(
        'ai_local_conversations',
        owner,
        id,
        StoredConversationSchema,
        tx,
      );
      if (conversation.nativeSessionId && conversation.nativeSessionId !== nativeSessionId)
        throw new LocalAgentError('LOCAL_AGENT_SESSION_UNAVAILABLE');
      if (
        conversation.accountFingerprint &&
        accountFingerprint &&
        conversation.accountFingerprint !== accountFingerprint
      )
        throw new LocalAgentError('LOCAL_AGENT_SESSION_UNAVAILABLE');
      const next = StoredConversationSchema.parse({
        ...conversation,
        nativeSessionId,
        accountFingerprint: accountFingerprint ?? conversation.accountFingerprint,
        modelId: modelId ?? conversation.modelId,
        updatedAt: Date.now(),
      });
      await tx.execute(
        'UPDATE ai_local_conversations SET record_json = ? WHERE id = ? AND identity_id = ?',
        [JSON.stringify(next), id, owner],
      );
    });
  }
  async saveMessage(
    owner: string,
    message: AssistantRuntimeMessageView,
    complete: boolean,
  ): Promise<void> {
    const item = StoredMessageSchema.parse({ ...message, complete });
    if (item.content.length > 200_000) throw new LocalAgentError('LOCAL_AGENT_PROTOCOL_ERROR');
    await this.db.writeTransaction(async (tx) => {
      const conversation = await this.read(
        'ai_local_conversations',
        owner,
        item.conversationId,
        StoredConversationSchema,
        tx,
      );
      // Transactional existence check prevents late events resurrecting a deleted conversation.
      await tx.execute(
        'INSERT OR REPLACE INTO ai_local_conversation_items (id, identity_id, conversation_id, created_at, record_json) VALUES (?, ?, ?, ?, ?)',
        [item.id, owner, item.conversationId, item.createdAt, JSON.stringify(item)],
      );
      await tx.execute(
        'UPDATE ai_local_conversations SET record_json = ? WHERE id = ? AND identity_id = ?',
        [JSON.stringify({ ...conversation, updatedAt: Date.now() }), conversation.id, owner],
      );
    });
  }
  async listMessages(owner: string, conversationId: string) {
    await this.getConversation(owner, conversationId);
    const rows = await this.db.getAll<unknown>(
      'SELECT record_json FROM ai_local_conversation_items WHERE identity_id = ? AND conversation_id = ? ORDER BY created_at DESC, id DESC LIMIT 500',
      [owner, conversationId],
    );
    const items = rows.map((row) => decode(row, StoredMessageSchema)).reverse();
    return {
      conversationId,
      messages: items.map(({ complete: _complete, ...message }) => message),
      incomplete: rows.length === 500 || items.some((item) => !item.complete),
    };
  }
  async deleteConversation(owner: string, id: string): Promise<boolean> {
    return this.db.writeTransaction(async (tx) => {
      const row = await tx.getOptional(
        'SELECT id FROM ai_local_conversations WHERE id = ? AND identity_id = ?',
        [id, owner],
      );
      if (!row) return false;
      await tx.execute('DELETE FROM ai_local_conversations WHERE id = ? AND identity_id = ?', [
        id,
        owner,
      ]);
      await tx.execute(
        'DELETE FROM ai_local_conversation_items WHERE conversation_id = ? AND identity_id = ?',
        [id, owner],
      );
      return true;
    });
  }
}
