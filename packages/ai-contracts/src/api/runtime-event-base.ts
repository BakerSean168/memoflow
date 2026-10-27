import { z } from 'zod';
export const RuntimeEventBaseShape = {
  eventId: z.string().min(1),
  runId: z.string().min(1),
  conversationId: z.string().min(1),
  sequence: z.number().int().positive(),
  createdAt: z.number().int().nonnegative(),
} as const;
