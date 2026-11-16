import { createHash, randomBytes } from 'node:crypto';
import { it, expect } from 'vitest';
import { LocalMcpClientRepository } from './local-mcp-client.repository';
import { createLocalAgentSqlite } from '../../../../testing/local-agent-sqlite';

it('persists only the token hash and keeps revocation idempotent', async () => {
  const db = createLocalAgentSqlite();
  const repository = new LocalMcpClientRepository(db);
  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  try {
    const client = await repository.create('owner', {
      name: 'Codex',
      writeScopes: ['tasks:write', 'tasks:write'],
      tokenHash,
      tokenPrefix: token.slice(0, 8),
    });
    expect(client.writeScopes).toEqual(['tasks:write']);
    expect(client.revokedAt).toBeNull();

    const row = await db.get<{ record_json: string }>(
      'SELECT record_json FROM ai_local_mcp_clients WHERE id = ? AND identity_id = ?',
      [client.id, 'owner'],
    );
    expect(row.record_json).toContain(tokenHash);
    expect(row.record_json).not.toContain(token);

    expect(await repository.listCredentials()).toEqual([
      { identityId: 'owner', id: client.id, tokenHash },
    ]);
    // Another identity cannot read or revoke the record.
    await expect(repository.get('other', client.id)).rejects.toThrow();

    const revoked = await repository.revoke('owner', client.id);
    expect(revoked.revokedAt).not.toBeNull();
    const again = await repository.revoke('owner', client.id);
    expect(again.revokedAt).toBe(revoked.revokedAt);
    expect((await repository.list('owner'))[0]?.revokedAt).toBe(revoked.revokedAt);
  } finally {
    db.close();
  }
});
