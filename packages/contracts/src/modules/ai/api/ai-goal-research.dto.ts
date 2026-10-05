import { z } from 'zod';

export const GoalResearchIntentSchema = z.enum(['requirements', 'timeline', 'resources']);
export type GoalResearchIntent = z.infer<typeof GoalResearchIntentSchema>;

const GoalResearchPublicUrlSchema = z
  .string()
  .url()
  .max(2000)
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password
      );
    } catch {
      return false;
    }
  }, 'Research source must be a public HTTP(S) URL without embedded credentials');

export const GoalResearchSourceSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    url: GoalResearchPublicUrlSchema,
    snippet: z.string().trim().max(1200).optional(),
  })
  .strict();
export type GoalResearchSource = z.infer<typeof GoalResearchSourceSchema>;

/**
 * Bounded public-web evidence used only by Goal planning.
 *
 * External research is never owner/domain truth. It is invocation/workflow
 * evidence with explicit provenance and can disappear without blocking the
 * durable Goal workflow.
 */
export const GoalResearchEvidenceSchema = z
  .object({
    query: z.string().trim().min(1).max(500),
    intent: GoalResearchIntentSchema,
    summary: z.string().trim().min(1).max(6000),
    sources: z.array(GoalResearchSourceSchema).min(1).max(6),
    trust: z.literal('external_untrusted'),
    provenance: z.literal('external'),
  })
  .strict();
export type GoalResearchEvidence = z.infer<typeof GoalResearchEvidenceSchema>;
