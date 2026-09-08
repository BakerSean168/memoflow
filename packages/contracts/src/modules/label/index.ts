/** Shared personal classification contract (ADR-054). */
import { z } from 'zod';

export interface LabelDto {
  readonly id: string;
  readonly identityId: string;
  readonly name: string;
  readonly normalizedName: string;
  readonly color: string | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/** Current-user presentation DTO. Identity ownership remains host-side. */
export const LabelClientDTOSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  color: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
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
    color: z.string().max(32).nullable().optional(),
  })
  .strict();
export type CreateLabelReq = z.infer<typeof CreateLabelReqSchema>;

export interface CreateLabelCommand {
  readonly identityId: string;
  readonly name: string;
  readonly color?: string | null;
}

export interface UpdateLabelCommand {
  readonly identityId: string;
  readonly labelId: string;
  readonly name?: string;
  readonly color?: string | null;
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

export interface LabelAssignmentCommand {
  readonly identityId: string;
  readonly labelIds: readonly string[];
}

export interface GoalLabelAssignmentCommand extends LabelAssignmentCommand {
  readonly goalId: string;
}

export interface TaskLabelAssignmentCommand extends LabelAssignmentCommand {
  readonly taskPlanId: string;
}
