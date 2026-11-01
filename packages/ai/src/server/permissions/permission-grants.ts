import {
  PermissionObjectSchema,
  type PermissionAction,
  type PermissionObject,
  type PermissionSettings,
} from '@memoflow/ai-contracts';
import { PERMISSION_PRESETS } from './permission-policy';

/**
 * A persistent user approval is a business-object read/write exception, not an
 * Agent-specific grant. Keep CRUD as a compatibility detail of the stored schema.
 */
export function withAllowedBusinessAccess(
  settings: PermissionSettings,
  object: PermissionObject,
  action: PermissionAction,
): PermissionSettings {
  if (object === 'ai_permission') throw new Error('AI cannot change business permissions');
  const fallback =
    settings.preset === 'custom'
      ? PERMISSION_PRESETS.confirm_each
      : PERMISSION_PRESETS[settings.preset];
  const matrix = Object.fromEntries(
    PermissionObjectSchema.options
      .filter((item) => item !== 'ai_permission')
      .map((item) => {
        const old = settings.preset === 'custom' ? settings.customMatrix?.[item] : undefined;
        return [
          item,
          {
            read: old?.read ?? fallback.read,
            create: old?.create ?? fallback.create,
            update: old?.update ?? fallback.update,
            delete: old?.delete ?? fallback.delete,
          },
        ];
      }),
  ) as NonNullable<PermissionSettings['customMatrix']>;
  if (action === 'read') {
    matrix[object]!.read = 'allow';
  } else {
    matrix[object]!.create = 'allow';
    matrix[object]!.update = 'allow';
    matrix[object]!.delete = 'allow';
  }
  return {
    ...settings,
    preset: 'custom',
    agentPresets: {},
    customMatrix: matrix,
  };
}
