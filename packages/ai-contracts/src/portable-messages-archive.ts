import { createHash } from 'node:crypto';
import { z } from 'zod';
import type {
  ArchiveManifest,
  ArchiveThreadManifestEntry,
} from '@memoflow/data-portability-contracts';

/**
 * Shared NDJSON archive canonicalizer for `ai-conversation-messages@1`.
 *
 * This module is a separate package entry (not re-exported from the browser-facing
 * root barrel) because it uses `node:crypto`. Both the server import path
 * (`@memoflow/ai`) and the desktop main process import
 * `@memoflow/ai-contracts/portable-messages-archive`, so the digest definitions
 * exist exactly once.
 *
 * Exact serialization (intentionally literal, see #865 design §2.4):
 * - `sha256(x)` hashes the UTF-8 bytes of `x` and returns lowercase hex.
 * - `messageDigest_i = sha256(JSON.stringify([ordinal, role, type, sha256(content)]))`.
 * - `threadDigest = sha256(messageDigest_0 + ... + messageDigest_n-1)`: the lowercase
 *   hex message digests are concatenated with no separator, in ascending `ordinal`
 *   order, and hashed as UTF-8.
 * - `archiveDigest = sha256(JSON.stringify(sortedByRef([[ref, messageCount, threadDigest], ...])))`:
 *   the triples are sorted by `ref` with JavaScript string comparison and serialized
 *   as a compact JSON array with no extra whitespace.
 */

const sha256Hex = (value: string): string =>
  createHash('sha256').update(value, 'utf8').digest('hex');

export const ArchiveThreadLineV1Schema = z
  .object({
    k: z.literal('thread'),
    v: z.literal(1),
    ref: z.string().min(1),
    createdAt: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative(),
  })
  .strict();
export type ArchiveThreadLineV1 = z.infer<typeof ArchiveThreadLineV1Schema>;

export const ArchiveMessageLineV1Schema = z
  .object({
    k: z.literal('message'),
    v: z.literal(1),
    ref: z.string().min(1),
    ordinal: z.number().int().nonnegative(),
    sid: z.string().min(1),
    role: z.string().min(1),
    type: z.string().min(1),
    content: z.string(),
    createdAt: z.number().int().nonnegative(),
  })
  .strict();
export type ArchiveMessageLineV1 = z.infer<typeof ArchiveMessageLineV1Schema>;

export const ArchiveLineV1Schema = z.discriminatedUnion('k', [
  ArchiveThreadLineV1Schema,
  ArchiveMessageLineV1Schema,
]);
export type ArchiveLineV1 = z.infer<typeof ArchiveLineV1Schema>;

type MessageDigestInput = Pick<ArchiveMessageLineV1, 'ordinal' | 'role' | 'type' | 'content'>;

/** Digest one message. `sid` and `createdAt` are deliberately excluded. */
export function computeMessageDigest(message: MessageDigestInput): string {
  return sha256Hex(
    JSON.stringify([
      message.ordinal,
      message.role,
      message.type,
      sha256Hex(message.content),
    ]),
  );
}

/** Digest one conversation's messages in ascending `ordinal` order. */
export function computeThreadDigest(messages: readonly MessageDigestInput[]): string {
  const digests = [...messages]
    .sort((left, right) => left.ordinal - right.ordinal)
    .map(computeMessageDigest);
  return sha256Hex(digests.join(''));
}

/** Build one manifest entry from a conversation's message rows. */
export function computeThreadManifestEntry(
  conversationRef: string,
  messages: readonly ArchiveMessageLineV1[],
): ArchiveThreadManifestEntry {
  return {
    conversationRef,
    messageCount: messages.length,
    digest: computeThreadDigest(messages),
  };
}

/** Combine per-conversation entries into the archive manifest. */
export function computeArchiveManifest(
  threads: readonly ArchiveThreadManifestEntry[],
): ArchiveManifest {
  const sorted = [...threads].sort((left, right) => {
    if (left.conversationRef < right.conversationRef) return -1;
    if (left.conversationRef > right.conversationRef) return 1;
    return 0;
  });

  return {
    archive: {
      digest: sha256Hex(
        JSON.stringify(
          sorted.map((thread) => [thread.conversationRef, thread.messageCount, thread.digest]),
        ),
      ),
      threads: sorted.length,
      messages: sorted.reduce((total, thread) => total + thread.messageCount, 0),
    },
    threads: sorted,
  };
}
