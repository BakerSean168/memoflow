import { afterEach, describe, expect, it, vi } from 'vitest';
import { readSelectedLocalAgentKnowledge } from './selected-knowledge';
const source = {
  kind: 'local_vault' as const,
  bindingId: 'vault-1',
  relativePath: 'ordinary.md',
  contentHash: 'a'.repeat(64),
};
const selection = { entityType: 'knowledge_source' as const, id: 'source-1', source };
const grant = { url: 'http://127.0.0.1:1/mcp', token: 'test-grant', revoke() {} };
afterEach(() => vi.unstubAllGlobals());
describe('native selected knowledge', () => {
  it('reads through the authorized MCP tool with the exact source snapshot', async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            result: {
              structuredContent: {
                note: {
                  title: 'Ordinary',
                  path: 'ordinary.md',
                  url: '/repository?notePath=ordinary.md',
                  contentHash: source.contentHash,
                  content: '# Real body',
                },
              },
            },
          }),
        ),
    );
    vi.stubGlobal('fetch', fetch);
    expect(
      await readSelectedLocalAgentKnowledge(grant, [selection], new AbortController().signal),
    ).toEqual([expect.objectContaining({ content: '# Real body' })]);
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toMatchObject({
      method: 'tools/call',
      params: { name: 'knowledge_get', arguments: { source } },
    });
  });
  it('propagates explicit denial instead of injecting note content', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              result: {
                isError: true,
                content: [{ text: '读取权限未授权' }],
                structuredContent: { error: { code: 'PERMISSION_DENIED' } },
              },
            }),
          ),
      ),
    );
    await expect(
      readSelectedLocalAgentKnowledge(grant, [selection], new AbortController().signal),
    ).rejects.toMatchObject({ code: 'LOCAL_AGENT_PERMISSION_DENIED' });
  });
  it('does not infer a permission decision from unstructured error prose', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              result: {
                isError: true,
                content: [{ text: 'Something mentions FORBIDDEN but supplies no code' }],
              },
            }),
          ),
      ),
    );
    await expect(
      readSelectedLocalAgentKnowledge(grant, [selection], new AbortController().signal),
    ).rejects.toMatchObject({ code: 'LOCAL_AGENT_TOOLS_UNAVAILABLE' });
  });
  it.each([
    'invalid JSON',
    '{}',
    JSON.stringify({ result: { structuredContent: { note: { title: 'Incomplete' } } } }),
  ])('reports malformed MCP responses as unavailable: %s', async (body) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(body)),
    );
    await expect(
      readSelectedLocalAgentKnowledge(grant, [selection], new AbortController().signal),
    ).rejects.toMatchObject({ code: 'LOCAL_AGENT_TOOLS_UNAVAILABLE' });
  });
  it.each(['NOT_FOUND', 'CONFLICT', 'VALIDATION_ERROR'])(
    'reports a source lookup failure as stale: %s',
    async (code) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(
          async () =>
            new Response(
              JSON.stringify({ result: { isError: true, structuredContent: { error: { code } } } }),
            ),
        ),
      );
      await expect(
        readSelectedLocalAgentKnowledge(grant, [selection], new AbortController().signal),
      ).rejects.toMatchObject({ code: 'KNOWLEDGE_CONTEXT_STALE' });
    },
  );
  it('returns an actionable stale-context failure for a changed note', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () => new Response(JSON.stringify({ result: { structuredContent: { note: null } } })),
      ),
    );
    await expect(
      readSelectedLocalAgentKnowledge(grant, [selection], new AbortController().signal),
    ).rejects.toMatchObject({ code: 'KNOWLEDGE_CONTEXT_STALE' });
  });
});
