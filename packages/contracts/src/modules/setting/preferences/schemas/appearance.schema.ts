import { z } from 'zod';

export const AppearanceSchema = z.object({
  theme: z.enum(['light', 'dark', 'auto']).default('auto'),
}).strict();
