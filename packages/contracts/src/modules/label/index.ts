/** Shared personal classification contract (ADR-054 / ADR-103). */
import { z } from 'zod';
import type { Instant } from '../../primitives/instant';

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
