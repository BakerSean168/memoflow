import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { IElectronDatabase, IElectronDatabaseTransaction } from '@memoflow/desktop-contracts';
import {
  LocalMcpClientSchema,
  type LocalMcpClient,
  type LocalMcpClientCreate,
} from '@memoflow/ai-contracts';
import { LocalAgentError } from '../../../../shared/local-agent-error';

/** Persisted shape: the public record plus the SHA-256 hash of the bearer token. */
const StoredMcpClientSchema = LocalMcpClientSchema.extend({
  tokenHash: z.string().regex(/^[a-f0-9]{64}$/),
});
export type StoredMcpClient = z.infer<typeof StoredMcpClientSchema>;

/** Hash-only credential index entry; enough to resolve a token, nothing more. */
export interface McpClientCredentialRef {
  readonly identityId: string;
  readonly id: string;
  readonly tokenHash: string;
}

const rowSchema = z.object({ record_json: z.string() });

function decode<T>(row: unknown, schema: z.ZodType<T>): T {
  return schema.parse(JSON.parse(rowSchema.parse(row).record_json));
}

/** Drop the hash before the record crosses the public boundary. */
function publicClient(record: StoredMcpClient): LocalMcpClient {
  const { tokenHash: _tokenHash, ...client } = record;
  return LocalMcpClientSchema.parse(client);
}

/**
 * Profile-local external MCP clients. Tokens are never persisted: the record
 * keeps the SHA-256 hash and a short display prefix only.
 */
export class LocalMcpClientRepository {
  constructor(private readonly db: IElectronDatabase) {}

  private async read(
    owner: string,
    id: string,
    tx: IElectronDatabaseTransaction = this.db,
  ): Promise<StoredMcpClient> {
    const row = await tx.getOptional<unknown>(
      'SELECT record_json FROM ai_local_mcp_clients WHERE id = ? AND identity_id = ?',
      [id, owner],
    );
    if (!row) throw new LocalAgentError('NOT_FOUND');
    return decode(row, StoredMcpClientSchema);
  }

  async list(owner: string): Promise<LocalMcpClient[]> {
    const rows = await this.db.getAll<unknown>(
      'SELECT record_json FROM ai_local_mcp_clients WHERE identity_id = ? ORDER BY id LIMIT 100',
      [owner],
    );
    return rows.map((row) => publicClient(decode(row, StoredMcpClientSchema)));
  }

  async get(owner: string, id: string, tx?: IElectronDatabaseTransaction): Promise<LocalMcpClient> {
    return publicClient(await this.read(owner, id, tx));
  }

  async create(
    owner: string,
    input: LocalMcpClientCreate & { tokenHash: string; tokenPrefix: string },
  ): Promise<LocalMcpClient> {
    const record: StoredMcpClient = StoredMcpClientSchema.parse({
      id: randomUUID(),
      name: input.name,
      writeScopes: [...new Set(input.writeScopes)],
      tokenPrefix: input.tokenPrefix,
      createdAt: Date.now(),
      revokedAt: null,
      tokenHash: input.tokenHash,
    });
    await this.db.execute(
      'INSERT INTO ai_local_mcp_clients (id, identity_id, record_json) VALUES (?, ?, ?)',
      [record.id, owner, JSON.stringify(record)],
    );
    return publicClient(record);
  }

  async revoke(owner: string, id: string): Promise<LocalMcpClient> {
    return this.db.writeTransaction(async (tx) => {
      const record = await this.read(owner, id, tx);
      const next: StoredMcpClient = {
        ...record,
        revokedAt: record.revokedAt ?? Date.now(),
      };
      await tx.execute(
        'UPDATE ai_local_mcp_clients SET record_json = ? WHERE id = ? AND identity_id = ?',
        [JSON.stringify(next), id, owner],
      );
      return publicClient(next);
    });
  }

  /**
   * Token-to-client index for the bridge. A bearer token is the only input, so
   * the index cannot be owner-filtered; each resolved record still scopes its
   * own writes by its own identity.
   */
  async listCredentials(): Promise<readonly McpClientCredentialRef[]> {
    const rows = await this.db.getAll<unknown>(
      'SELECT identity_id, record_json FROM ai_local_mcp_clients LIMIT 1000',
    );
    const credentials: McpClientCredentialRef[] = [];
    for (const row of rows) {
      const parsed = z.object({ identity_id: z.string(), record_json: z.string() }).safeParse(row);
      if (!parsed.success) continue;
      const record = StoredMcpClientSchema.safeParse(JSON.parse(parsed.data.record_json));
      if (!record.success) continue;
      credentials.push({
        identityId: parsed.data.identity_id,
        id: record.data.id,
        tokenHash: record.data.tokenHash,
      });
    }
    return credentials;
  }
}
