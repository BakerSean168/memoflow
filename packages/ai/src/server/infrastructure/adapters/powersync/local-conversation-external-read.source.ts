import { z } from 'zod';
import type { IElectronDatabase } from '@memoflow/desktop-contracts';
import type {
  AssistantConversationExternalAttachmentFact,
  AssistantConversationExternalMessageFact,
  AssistantConversationExternalReadSource,
  AssistantConversationExternalShellFact,
  AssistantConversationExternalStatus,
} from '../../../application/ports/assistant-conversation-external-read.port';

const conversationRowSchema = z.object({
  id: z.string(),
  record_json: z.string(),
});
const countRowSchema = z.object({ conversation_id: z.string(), count: z.number() });
const itemRowSchema = z.object({ record_json: z.string() });

/**
 * Read-side field whitelist.
 *
 * Stored records carry extra host fields (fingerprints, native session ids,
 * approval receipts, tool activity). Selecting only these keys here means the
 * projection cannot forward them even if a record gains a new sensitive field.
 */
const storedConversationSchema = z.object({
  id: z.string().min(1).max(512),
  name: z.string().min(1).max(240),
  status: z.enum(['Active', 'Archived']).optional(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});
const storedAttachmentSchema = z.object({
  mediaType: z.string().min(1).max(120),
  filename: z.string().min(1).max(255).optional(),
});
const storedMessageSchema = z.object({
  id: z.string().min(1).max(512),
  conversationId: z.string().min(1).max(512),
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string(),
  attachments: z.array(storedAttachmentSchema).max(4).default([]),
  createdAt: z.number().int().nonnegative(),
});

/**
 * Owner-scoped source for the bounded external conversation projection.
 *
 * Only the local Agent session tables are read. The projection receives the
 * explicit whitelist below, never a raw row, so provider credentials,
 * permission policy, tool arguments and attachment bytes have no field to
 * travel through.
 */
export class LocalConversationExternalReadSource implements AssistantConversationExternalReadSource {
  constructor(private readonly db: IElectronDatabase) {}

  private async counts(identityId: string): Promise<Map<string, number>> {
    const rows = await this.db.getAll<unknown>(
      `SELECT conversation_id, COUNT(*) AS count
         FROM ai_local_conversation_items
        WHERE identity_id = ?
        GROUP BY conversation_id`,
      [identityId],
    );
    const counts = new Map<string, number>();
    for (const row of rows) {
      const parsed = countRowSchema.safeParse(row);
      if (parsed.success) counts.set(parsed.data.conversation_id, parsed.data.count);
    }
    return counts;
  }

  private shell(row: unknown, messageCount: number): AssistantConversationExternalShellFact | null {
    const parsed = conversationRowSchema.safeParse(row);
    if (!parsed.success) return null;
    const conversation = storedConversationSchema.safeParse(JSON.parse(parsed.data.record_json));
    // A record that no longer matches the owner contract cannot become a shell.
    if (!conversation.success) return null;
    return {
      id: conversation.data.id,
      title: conversation.data.name,
      status: conversation.data.status ?? 'Active',
      messageCount,
      createdAt: conversation.data.createdAt,
      updatedAt: conversation.data.updatedAt,
    };
  }

  async listOwnedShells(
    identityId: string,
    status?: AssistantConversationExternalStatus,
  ): Promise<readonly AssistantConversationExternalShellFact[]> {
    const [rows, counts] = await Promise.all([
      this.db.getAll<unknown>(
        'SELECT id, record_json FROM ai_local_conversations WHERE identity_id = ?',
        [identityId],
      ),
      this.counts(identityId),
    ]);
    const shells: AssistantConversationExternalShellFact[] = [];
    for (const row of rows) {
      const parsed = conversationRowSchema.safeParse(row);
      if (!parsed.success) continue;
      const shell = this.shell(row, counts.get(parsed.data.id) ?? 0);
      if (!shell) continue;
      if (status && shell.status !== status) continue;
      shells.push(shell);
    }
    return shells;
  }

  async findOwnedShell(
    identityId: string,
    conversationId: string,
  ): Promise<AssistantConversationExternalShellFact | null> {
    const row = await this.db.getOptional<unknown>(
      'SELECT id, record_json FROM ai_local_conversations WHERE id = ? AND identity_id = ? LIMIT 1',
      [conversationId, identityId],
    );
    if (!row) return null;
    const count = await this.db.getOptional<unknown>(
      'SELECT COUNT(*) AS count FROM ai_local_conversation_items WHERE identity_id = ? AND conversation_id = ?',
      [identityId, conversationId],
    );
    const parsedCount = z.object({ count: z.number() }).safeParse(count);
    return this.shell(row, parsedCount.success ? parsedCount.data.count : 0);
  }

  async readMessagePage(
    identityId: string,
    conversationId: string,
    slice: { readonly offset: number; readonly limit: number },
  ): Promise<readonly AssistantConversationExternalMessageFact[]> {
    const rows = await this.db.getAll<unknown>(
      `SELECT record_json FROM ai_local_conversation_items
        WHERE identity_id = ? AND conversation_id = ?
        ORDER BY created_at, id
        LIMIT ? OFFSET ?`,
      [identityId, conversationId, slice.limit, slice.offset],
    );
    const messages: AssistantConversationExternalMessageFact[] = [];
    for (const row of rows) {
      const parsed = itemRowSchema.safeParse(row);
      if (!parsed.success) continue;
      const message = storedMessageSchema.safeParse(JSON.parse(parsed.data.record_json));
      if (!message.success || message.data.conversationId !== conversationId) continue;
      const attachments: AssistantConversationExternalAttachmentFact[] =
        message.data.attachments.map((attachment) => ({
          mediaType: attachment.mediaType,
          filename: attachment.filename,
        }));
      messages.push({
        id: message.data.id,
        role: message.data.role,
        content: message.data.content,
        attachments,
        createdAt: message.data.createdAt,
      });
    }
    return messages;
  }
}
