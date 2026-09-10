import { z } from 'zod';
import type { AccountClientDTO } from '../aggregates/account-client';

export type GetAccountReq = void;
export type GetAccountRes = AccountClientDTO;

export const UpdateAccountSchema = z.object({
  nickname: z.string().min(1).max(100).optional(),
  avatar: z.string().url().optional().nullable(),
  bio: z.string().max(500).optional().nullable(),
});

export type UpdateAccountReq = z.infer<typeof UpdateAccountSchema>;
export type UpdateAccountRes = AccountClientDTO;
