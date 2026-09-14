/** Shared personal classification contract (ADR-054 / ADR-103). */
import { z } from 'zod';
import type { Instant } from '../../primitives/instant';
import { PortableReferenceV3Schema } from '../data-portability/dtos/portable-v3.dto';

/** Canonical Shared Label RGB color. Runtime contract is exactly #RRGGBB. */
export type LabelColor = `#${string}`;

export const LabelColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Label color must be a 6-digit RGB hex value.')
  .transform((value): LabelColor => value.toLowerCase() as LabelColor);

export interface LabelDto {
  readonly id: string;
  readonly identityId: string;
  readonly name: string;
  readonly normalizedName: string;
  readonly color: LabelColor | null;
  readonly createdAt: Instant;
  readonly updatedAt: Instant;
}

/** Current-user presentation DTO. Identity ownership remains host-side. */
export const LabelClientDTOSchema = z
  .object({
    id: z.string().min(1),
    name: z.string(),
    color: LabelColorSchema.nullable(),
    createdAt: z.number().finite(),
    updatedAt: z.number().finite(),
  })
  .strict();
export type LabelClientDTO = z.infer<typeof LabelClientDTOSchema>;

export const ListLabelsReqSchema = z
  .object({
    search: z.string().max(50).optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
  })
  .strict();
export type ListLabelsReq = z.infer<typeof ListLabelsReqSchema>;

export const CreateLabelReqSchema = z
  .object({
    name: z.string().trim().min(1).max(50),
    color: LabelColorSchema.nullable().optional(),
  })
  .strict();
export type CreateLabelReq = z.infer<typeof CreateLabelReqSchema>;

export interface CreateLabelCommand {
  readonly identityId: string;
  readonly name: string;
  readonly color?: LabelColor | null;
}

export interface UpdateLabelCommand {
  readonly identityId: string;
  readonly labelId: string;
  readonly name?: string;
  readonly color?: LabelColor | null;
}

export interface DeleteLabelCommand {
  readonly identityId: string;
  readonly labelId: string;
}

export interface ListLabelsQuery {
  readonly identityId: string;
  readonly search?: string | null;
  readonly limit?: number;
}

/** Owner-owned payload for the `labels@3` portability capability. */
export const LabelPortableItemV3Schema = z
  .object({
    ref: PortableReferenceV3Schema,
    name: z.string().trim().min(1).max(50),
    color: LabelColorSchema.nullable(),
  })
  .strict();
export type LabelPortableItemV3 = z.infer<typeof LabelPortableItemV3Schema>;

export const LabelPortablePayloadV3Schema = z
  .object({ labels: z.array(LabelPortableItemV3Schema).max(500) })
  .strict()
  .superRefine((payload, ctx) => {
    const names = new Set<string>();
    const refs = new Set<string>();
    payload.labels.forEach((label, index) => {
      const normalized = label.name.trim().toLocaleLowerCase();
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
