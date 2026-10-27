import { z } from 'zod';

/** Owners whose user facts must be checked before an empty-account copy. */
export const BusinessDataOwnerSchema = z.enum([
  'goal',
  'task',
  'label',
  'schedule',
  'routine',
  'repository',
  'ai',
  'notification',
  'relation',
]);
export type BusinessDataOwner = z.infer<typeof BusinessDataOwnerSchema>;
export const BusinessDataStateSchema = z.enum(['empty', 'non_empty', 'unknown']);

/** An observation, never an authorization to import or delete. */
export const BusinessDataSummarySchema = z
  .object({
    schemaVersion: z.literal(1),
    state: BusinessDataStateSchema,
    observedAt: z.iso.datetime(),
    owners: z.array(
      z
        .object({
          owner: BusinessDataOwnerSchema,
          state: BusinessDataStateSchema,
        })
        .strict(),
    ),
  })
  .strict()
  .superRefine((summary, context) => {
    const keys = new Set(summary.owners.map((owner) => owner.owner));
    if (
      keys.size !== BusinessDataOwnerSchema.options.length ||
      summary.owners.length !== keys.size
    ) {
      context.addIssue({ code: 'custom', message: 'Every business owner must occur exactly once' });
    }
    const state = summary.owners.some((owner) => owner.state === 'non_empty')
      ? 'non_empty'
      : summary.owners.every((owner) => owner.state === 'empty')
        ? 'empty'
        : 'unknown';
    if (summary.state !== state) {
      context.addIssue({ code: 'custom', message: 'Summary must agree with owner observations' });
    }
  });
export type BusinessDataSummary = z.infer<typeof BusinessDataSummarySchema>;
