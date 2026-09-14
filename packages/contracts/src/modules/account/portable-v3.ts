import { z } from 'zod';
import { YmdSchema } from '../../primitives';
import { GenderType } from './value-objects/gender-type';

/**
 * User-owned Account profile facts for Data Portability V3.
 * Host identity, auth state, lifecycle status, versions and timestamps stay outside the payload.
 */
export const PortableAccountProfileV3Schema = z
  .object({
    nickname: z.string().min(2).max(20),
    realName: z.string().nullable(),
    avatarUrl: z.string().url().nullable(),
    bio: z.string().max(500).nullable(),
    gender: z.enum(GenderType),
    birthday: YmdSchema.nullable(),
  })
  .strict();

export type PortableAccountProfileV3 = z.infer<typeof PortableAccountProfileV3Schema>;
