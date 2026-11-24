import { describe, expect, it } from 'vitest';
import {
  LocalAgentWriteScopeSchema,
  LocalMcpClientCreateSchema,
  LocalMcpClientSchema,
} from './local-agent.dto';

describe('Local MCP client contracts', () => {
  it('accepts every published write scope offered by Settings', () => {
    const writeScopes = [...LocalAgentWriteScopeSchema.options];
    expect(writeScopes.length).toBeGreaterThan(4);
    expect(LocalMcpClientCreateSchema.parse({ name: 'All scopes', writeScopes })).toEqual({
      name: 'All scopes',
      writeScopes,
    });
    expect(
      LocalMcpClientSchema.parse({
        id: 'client-1',
        name: 'All scopes',
        writeScopes,
        tokenPrefix: 'mf_prefix',
        createdAt: 1,
        revokedAt: null,
      }).writeScopes,
    ).toEqual(writeScopes);
  });
});
