import { z } from 'zod';

export const LocaleSchema = z.object({
  language: z.string().default('zh-CN'),
  timezone: z.string().default('Asia/Shanghai'),
  dateFormat: z.string().default('YYYY-MM-DD'),
  timeFormat: z.enum(['12H', '24H']).default('24H'),
  weekStartsOn: z.number().min(0).max(6).default(1),
}).strict();
