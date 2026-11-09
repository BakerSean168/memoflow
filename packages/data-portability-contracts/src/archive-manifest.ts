/**
 * Recomputed archive manifest for the `ai-conversation-messages@1` capability.
 *
 * This is the single definition of the manifest shape shared by:
 * - the V3 owner capability payload (`@memoflow/ai-contracts` re-exports it), and
 * - the Profile import archive `complete` response `computedManifest`.
 *
 * It lives in this package because `@memoflow/ai-contracts` already depends on
 * data-portability-contracts. Defining it in ai-contracts would force the archive
 * DTOs here to import ai-contracts and close a package cycle.
 */
import { z } from 'zod';

export const Sha256HexSchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/, 'Expected a lowercase sha256 hex digest');
export type Sha256Hex = z.infer<typeof Sha256HexSchema>;

export const ArchiveThreadManifestEntrySchema = z
  .object({
    conversationRef: z.string().min(1),
    messageCount: z.number().int().nonnegative(),
    digest: Sha256HexSchema,
  })
  .strict();
export type ArchiveThreadManifestEntry = z.infer<typeof ArchiveThreadManifestEntrySchema>;

export const ArchiveManifestSchema = z
  .object({
    archive: z
      .object({
        digest: Sha256HexSchema,
        threads: z.number().int().nonnegative(),
        messages: z.number().int().nonnegative(),
      })
      .strict(),
    threads: z.array(ArchiveThreadManifestEntrySchema),
  })
  .strict()
  .superRefine((manifest, ctx) => {
    if (manifest.threads.length !== manifest.archive.threads) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['archive', 'threads'],
        message: 'archive.threads must equal threads.length',
      });
    }

    const refs = new Set<string>();
    let messages = 0;
    for (const [index, thread] of manifest.threads.entries()) {
      messages += thread.messageCount;
      if (refs.has(thread.conversationRef)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['threads', index, 'conversationRef'],
          message: `Duplicate conversation reference: ${thread.conversationRef}`,
        });
      }
      refs.add(thread.conversationRef);
    }

    if (messages !== manifest.archive.messages) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['archive', 'messages'],
        message: 'archive.messages must equal the sum of thread messageCount values',
      });
    }
  });
export type ArchiveManifest = z.infer<typeof ArchiveManifestSchema>;
