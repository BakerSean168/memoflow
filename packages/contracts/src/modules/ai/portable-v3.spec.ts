import { describe, expect, it } from 'vitest';
import { ConversationStatus } from './value-objects/conversation-status';
import { AIConversationPortablePayloadV3Schema } from './portable-v3';

const shell = {
  ref: 'ai-conversations:1',
  name: 'Planning',
  status: ConversationStatus.Active,
} as const;

describe('AI Conversation shell portable V3 contract', () => {
  it('accepts the canonical shell payload and preserves only name/status facts', () => {
    expect(
      AIConversationPortablePayloadV3Schema.parse({ conversations: [shell] }),
    ).toEqual({ conversations: [shell] });
  });

  it('rejects invalid status, refs, and duplicate refs', () => {
    expect(
      AIConversationPortablePayloadV3Schema.safeParse({
        conversations: [{ ...shell, status: 'Closed' }],
      }).success,
    ).toBe(false);
    expect(
      AIConversationPortablePayloadV3Schema.safeParse({
        conversations: [{ ...shell, ref: 'conversations:1' }],
      }).success,
    ).toBe(false);
    expect(
      AIConversationPortablePayloadV3Schema.safeParse({
        conversations: [shell, { ...shell, name: 'Second' }],
      }).success,
    ).toBe(false);
  });

  it('strictly rejects identity, persistence, runtime, provider, secret, and execution fields', () => {
    const forbiddenFields: Record<string, unknown> = {
      id: 'source-conversation-id',
      identityId: 'source-identity',
      version: 7,
      createdAt: 1_789_000_000_000,
      updatedAt: 1_789_000_000_001,
      deletedAt: null,
      messages: [],
      transcript: [],
      provider: 'openai',
      secret: 'plain-secret',
      executionRecord: { outcome: 'succeeded' },
    };

    for (const [field, value] of Object.entries(forbiddenFields)) {
      expect(
        AIConversationPortablePayloadV3Schema.safeParse({
          conversations: [{ ...shell, [field]: value }],
        }).success,
        field,
      ).toBe(false);
    }
  });
});
