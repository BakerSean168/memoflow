/**
 * Label `labels@3` portability composition (ADR-054 / ADR-103).
 */
import { z } from 'zod';
import { PortableReferenceV3Schema } from '@memoflow/data-portability-contracts';
import { LabelColorSchema } from './index';

const LabelPortableReferenceV3Schema = PortableReferenceV3Schema.refine(
  (ref) => ref.startsWith('labels:'),
  'Label portable references must use the labels capability',
);

function normalizePortableLabelName(name: string): string {
  return name.normalize('NFKC').trim().toLowerCase();
}

/** Owner-owned payload for the `labels@3` portability capability. */
export const LabelPortableItemV3Schema = z
  .object({
    ref: LabelPortableReferenceV3Schema,
    name: z
      .string()
      .transform((value) => value.normalize('NFKC').trim())
      .pipe(z.string().min(1).max(50)),
    color: z.lazy(() => LabelColorSchema).nullable(),
  })
  .strict();
export type LabelPortableItemV3 = z.infer<typeof LabelPortableItemV3Schema>;

export const LabelPortablePayloadV3Schema = z
  .object({ labels: z.array(LabelPortableItemV3Schema) })
  .strict()
  .superRefine((payload, ctx) => {
    const names = new Set<string>();
    const refs = new Set<string>();
    payload.labels.forEach((label, index) => {
      const normalized = normalizePortableLabelName(label.name);
      if (names.has(normalized)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['labels', index, 'name'],
          message: `Duplicate portable label name: ${label.name}`,
        });
      }
      if (refs.has(label.ref)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['labels', index, 'ref'],
          message: `Duplicate portable label ref: ${label.ref}`,
        });
      }
      names.add(normalized);
      refs.add(label.ref);
    });
  });
export type LabelPortablePayloadV3 = z.infer<typeof LabelPortablePayloadV3Schema>;
