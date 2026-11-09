import { describe, expect, it } from 'vitest';
import {
  AI_CONVERSATION_MESSAGES_CAPABILITY,
  AIConversationMessagesPortablePayloadV1Schema,
} from './portable-v3-messages';

const digest = 'a'.repeat(64);

const payload = {
  archive: { digest, threads: 1, messages: 2 },
  threads: [{ conversationRef: 'ai-conversations:1', messageCount: 2, digest }],
};

describe('AI conversation messages portable V1 contract', () => {
  it('accepts the canonical manifest payload', () => {
    expect(AIConversationMessagesPortablePayloadV1Schema.parse(payload)).toEqual(payload);
  });

  it('exports the capability descriptor', () => {
    expect(AI_CONVERSATION_MESSAGES_CAPABILITY).toEqual({
      key: 'ai-conversation-messages',
      schemaVersion: 1,
      dependsOn: ['ai-conversations'],
    });
  });

  it('rejects a thread count that disagrees with threads.length', () => {
    expect(
      AIConversationMessagesPortablePayloadV1Schema.safeParse({
        ...payload,
        archive: { ...payload.archive, threads: 2 },
      }).success,
    ).toBe(false);
  });

  it('rejects a message total that disagrees with the per-thread counts', () => {
    expect(
      AIConversationMessagesPortablePayloadV1Schema.safeParse({
        ...payload,
        archive: { ...payload.archive, messages: 1 },
      }).success,
    ).toBe(false);
  });

  it('rejects duplicate conversation references', () => {
    expect(
      AIConversationMessagesPortablePayloadV1Schema.safeParse({
        archive: { digest, threads: 2, messages: 0 },
        threads: [
          { conversationRef: 'ai-conversations:1', messageCount: 0, digest },
          { conversationRef: 'ai-conversations:1', messageCount: 0, digest },
        ],
      }).success,
    ).toBe(false);
  });

  it('rejects negative message counts and malformed digests', () => {
    for (const badDigest of ['A'.repeat(64), 'a'.repeat(63), 'g'.repeat(64)]) {
      expect(
        AIConversationMessagesPortablePayloadV1Schema.safeParse({
          archive: { digest: badDigest, threads: 1, messages: 0 },
          threads: [{ conversationRef: 'ai-conversations:1', messageCount: 0, digest: badDigest }],
        }).success,
        badDigest,
      ).toBe(false);
    }
    expect(
      AIConversationMessagesPortablePayloadV1Schema.safeParse({
        archive: { digest, threads: 1, messages: -1 },
        threads: [{ conversationRef: 'ai-conversations:1', messageCount: -1, digest }],
      }).success,
    ).toBe(false);
  });

  it('rejects empty conversation references and unknown fields', () => {
    expect(
      AIConversationMessagesPortablePayloadV1Schema.safeParse({
        archive: { digest, threads: 1, messages: 0 },
        threads: [{ conversationRef: '', messageCount: 0, digest }],
      }).success,
    ).toBe(false);
    expect(
      AIConversationMessagesPortablePayloadV1Schema.safeParse({
        ...payload,
        identityId: 'source-identity',
      }).success,
    ).toBe(false);
    expect(
      AIConversationMessagesPortablePayloadV1Schema.safeParse({
        ...payload,
        threads: [{ ...payload.threads[0], sid: 'source-message-id' }],
      }).success,
    ).toBe(false);
  });
});
