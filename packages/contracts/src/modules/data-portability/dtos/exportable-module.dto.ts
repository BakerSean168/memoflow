/**
 * Exportable Module — the set of modules eligible for data portability
 */

import { z } from 'zod';

export const ExportableModuleSchema = z.enum([
  'settings',
  'goals',
  'tasks',
  'schedule',
  'reminders',
  'repository',
  'ai',
  'notifications',
]);

export type ExportableModule = z.infer<typeof ExportableModuleSchema>;

export const ALL_EXPORTABLE_MODULES: ExportableModule[] = [
  'settings',
  'goals',
  'tasks',
  'schedule',
  'reminders',
  'repository',
  'ai',
  'notifications',
];
