import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  AssistantRuntimeSelectedEntitySchema,
  KnowledgeContextSourceSchema,
} from './assistant-runtime.dto';
const source = {
  kind: 'local_vault',
  bindingId: 'vault-1',
  relativePath: '笔记/ordinary.md',
  contentHash: 'a'.repeat(64),
};
describe('invocation-scoped knowledge references', () => {
  it('accepts ordinary Markdown without a persistent document id and serializes for MCP', () => {
    expect(
      AssistantRuntimeSelectedEntitySchema.parse({
        entityType: 'knowledge_source',
        id: 'context-1',
        source,
      }),
    ).toMatchObject({ source });
    expect(z.toJSONSchema(KnowledgeContextSourceSchema).type).toBe('object');
  });
  it.each([
    '../secret.md',
    'nested/../../secret.md',
    '/etc/secret.md',
    'C:/secret.md',
    'nested\\secret.md',
    'file.txt',
  ])('rejects an unsafe source path: %s', (relativePath) => {
    expect(KnowledgeContextSourceSchema.safeParse({ ...source, relativePath }).success).toBe(false);
  });
  it('rejects client-authored content and identity in a reference', () => {
    expect(
      KnowledgeContextSourceSchema.safeParse({ ...source, identityId: 'other-user' }).success,
    ).toBe(false);
    expect(
      AssistantRuntimeSelectedEntitySchema.safeParse({
        entityType: 'knowledge_source',
        id: 'context-1',
        source,
        content: '# Injected',
      }).success,
    ).toBe(false);
  });
});
