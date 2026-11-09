import { describe, expect, it } from 'vitest';
import { ArchiveManifestSchema } from '@memoflow/data-portability-contracts';
import {
  ArchiveLineV1Schema,
  ArchiveMessageLineV1Schema,
  ArchiveThreadLineV1Schema,
  computeArchiveManifest,
  computeMessageDigest,
  computeThreadDigest,
  computeThreadManifestEntry,
  type ArchiveMessageLineV1,
} from './portable-messages-archive';

const message = (
  ordinal: number,
  content: string,
  overrides: Partial<ArchiveMessageLineV1> = {},
): ArchiveMessageLineV1 => ({
  k: 'message',
  v: 1,
  ref: 'ai-conversations:1',
  ordinal,
  sid: `source-message-${ordinal}`,
  role: 'assistant',
  type: 'text',
  content,
  createdAt: 1_700_000_000_000 + ordinal,
  ...overrides,
});

const thread = {
  k: 'thread' as const,
  v: 1 as const,
  ref: 'ai-conversations:1',
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_001,
};

describe('archive NDJSON line schemas', () => {
  it('accepts thread and message lines and rejects wrong versions or extra fields', () => {
    expect(ArchiveThreadLineV1Schema.parse(thread)).toEqual(thread);
    expect(ArchiveMessageLineV1Schema.parse(message(0, ''))).toEqual(message(0, ''));
    expect(ArchiveLineV1Schema.parse(thread)).toEqual(thread);
    expect(ArchiveLineV1Schema.parse(message(1, 'hello'))).toEqual(message(1, 'hello'));

    expect(ArchiveThreadLineV1Schema.safeParse({ ...thread, v: 2 }).success).toBe(false);
    expect(ArchiveMessageLineV1Schema.safeParse({ ...message(0, 'x'), ordinal: -1 }).success).toBe(
      false,
    );
    expect(ArchiveMessageLineV1Schema.safeParse({ ...message(0, 'x'), extra: true }).success).toBe(
      false,
    );
    expect(ArchiveLineV1Schema.safeParse({ k: 'other' }).success).toBe(false);
  });
});

describe('archive canonicalizer digests', () => {
  it('is stable for the same input', () => {
    expect(computeMessageDigest(message(0, 'hello'))).toBe(
      computeMessageDigest(message(0, 'hello')),
    );
    expect(computeThreadDigest([message(0, 'a'), message(1, 'b')])).toBe(
      computeThreadDigest([message(0, 'a'), message(1, 'b')]),
    );
  });

  it('ignores sid and createdAt but is sensitive to content', () => {
    const base = message(0, 'hello');
    const sameFacts = message(0, 'hello', { sid: 'other-id', createdAt: 1 });
    expect(computeMessageDigest(sameFacts)).toBe(computeMessageDigest(base));
    expect(computeThreadDigest([sameFacts])).toBe(computeThreadDigest([base]));
    expect(computeMessageDigest(message(0, 'hello!'))).not.toBe(computeMessageDigest(base));
  });

  it('orders by ordinal rather than by array position but changes when ordinals swap', () => {
    const first = message(0, 'first');
    const second = message(1, 'second');
    expect(computeThreadDigest([second, first])).toBe(computeThreadDigest([first, second]));
    expect(
      computeThreadDigest([
        { ...first, ordinal: 1 },
        { ...second, ordinal: 0 },
      ]),
    ).not.toBe(computeThreadDigest([first, second]));
  });

  it('builds a valid manifest entry and archive manifest independent of thread order', () => {
    const entry = computeThreadManifestEntry('ai-conversations:1', [
      message(1, 'second'),
      message(0, 'first'),
    ]);
    expect(entry.messageCount).toBe(2);
    expect(entry.digest).toBe(computeThreadDigest([message(0, 'first'), message(1, 'second')]));

    const other = {
      conversationRef: 'ai-conversations:2',
      messageCount: 1,
      digest: 'b'.repeat(64),
    };
    const manifest = computeArchiveManifest([entry, other]);
    expect(manifest.archive).toEqual({ digest: expect.any(String), threads: 2, messages: 3 });
    expect(manifest.threads.map((thread) => thread.conversationRef)).toEqual([
      'ai-conversations:1',
      'ai-conversations:2',
    ]);
    expect(ArchiveManifestSchema.parse(manifest)).toEqual(manifest);
    expect(computeArchiveManifest([other, entry])).toEqual(manifest);

    expect(
      computeArchiveManifest([{ ...entry, messageCount: entry.messageCount + 1 }]).archive.digest,
    ).not.toBe(manifest.archive.digest);
  });
});
