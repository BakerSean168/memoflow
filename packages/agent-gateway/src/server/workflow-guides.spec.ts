import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createReadGateway } from './read-gateway';
import { GOAL_PLANNING_SKILL, GOAL_PLANNING_SKILL_URI } from '../workflow-guides';

function fixture() {
  const authenticate = vi.fn().mockResolvedValue({
    identityId: 'owner',
    credentialId: 'pat',
    credentialType: 'pat',
    scopes: ['tasks:read'],
  });
  const ownerRead = vi.fn();
  const checkpoint = vi.fn(() => {
    throw new Error('Static guidance must not invoke business policy');
  });
  const audit = vi.fn();
  const gateway = createReadGateway({
    enabled: true,
    audience: 'https://memo.test/mcp',
    trustedOrigins: [],
    cursorSecret: 'fixture-only-secret'.repeat(3),
    toolCheckpoint: checkpoint,
    credentials: { authenticate, consumeReadQuota: async () => true },
    consumeOwnerQuota: async () => true,
    goals: { getGoal: ownerRead, searchGoalPage: ownerRead },
    audit,
  });
  async function invoke(method: string, params: Record<string, unknown> = {}) {
    const response = await gateway.fetch(
      new Request('https://memo.test/mcp', {
        method: 'POST',
        headers: {
          authorization: 'Bearer test',
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          'MCP-Protocol-Version': '2026-07-28',
          'Mcp-Method': method,
          ...(method === 'tools/call' ? { 'Mcp-Name': String(params.name) } : {}),
          ...(method === 'resources/read' ? { 'Mcp-Name': String(params.uri) } : {}),
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method,
          params: {
            ...params,
            _meta: {
              'io.modelcontextprotocol/protocolVersion': '2026-07-28',
              'io.modelcontextprotocol/clientInfo': { name: 'fixture', version: '1' },
              'io.modelcontextprotocol/clientCapabilities': {},
            },
          },
        }),
      }),
      { requestId: 'request', traceId: 'request', source: 'http', startedAt: Date.now() },
    );
    return { status: response.status, body: await response.json() };
  }
  return { invoke, authenticate, ownerRead, checkpoint, audit };
}

describe('shared business guidance over MCP', () => {
  it('serves one verified standard Skill and the same complete fallback text', async () => {
    const f = fixture();
    const discover = await f.invoke('server/discover');
    expect(discover.body.result.capabilities.extensions).toHaveProperty(
      'io.modelcontextprotocol/skills',
    );
    const listing = await f.invoke('skills/list');
    const entry = listing.body.result.skills[0];
    expect(entry.uri).toBe(GOAL_PLANNING_SKILL_URI);
    expect(entry.frontmatter.name).toBe('goal-planning');
    const detail = await f.invoke('skills/get', { uri: entry.uri });
    expect(detail.body.result.skill).toEqual(entry);
    const read = await f.invoke('resources/read', { uri: entry.uri });
    expect(read.body, JSON.stringify(read.body)).toHaveProperty('result');
    expect(read.body.result.contents[0].text).toBe(GOAL_PLANNING_SKILL);
    expect(entry.resources[0]).toMatchObject({
      size: Buffer.byteLength(GOAL_PLANNING_SKILL),
      digest: 'sha256:' + createHash('sha256').update(GOAL_PLANNING_SKILL).digest('hex'),
    });
    const fallback = await f.invoke('tools/call', { name: 'workflow_guide_get', arguments: {} });
    expect(fallback.body.result.content).toEqual([{ type: 'text', text: GOAL_PLANNING_SKILL }]);
    expect(fallback.body.result.structuredContent.markdown).toBe(GOAL_PLANNING_SKILL);
    expect(f.ownerRead).not.toHaveBeenCalled();
    expect(f.checkpoint).not.toHaveBeenCalled();
    expect(f.audit).toHaveBeenLastCalledWith(
      expect.objectContaining({ tool: 'workflow_guide_get', outcome: 'OK' }),
    );
  });
  it('keeps static discovery separate from business grants and rejects revoked reads', async () => {
    const f = fixture();
    const listing = await f.invoke('tools/list');
    expect(listing.body.result.tools.map((tool: { name: string }) => tool.name)).toEqual([
      'workflow_guide_get',
      'goal_plan_validate',
    ]);
    const unknown = await f.invoke('tools/call', {
      name: 'workflow_guide_get',
      arguments: { guide: 'private' },
    });
    expect(unknown.body.result.isError).toBe(true);
    f.authenticate.mockResolvedValue(null);
    expect((await f.invoke('resources/read', { uri: GOAL_PLANNING_SKILL_URI })).status).toBe(401);
    expect(
      (await f.invoke('tools/call', { name: 'workflow_guide_get', arguments: {} })).status,
    ).toBe(401);
  });
});
