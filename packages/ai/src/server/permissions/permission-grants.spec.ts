import { describe, expect, it } from 'vitest';
import { PermissionSettingsSchema } from '@memoflow/ai-contracts';
import { withAllowedBusinessAccess } from './permission-grants';

describe('withAllowedBusinessAccess', () => {
  it('turns one confirmed business write into a visible object-level exception', () => {
    const settings = PermissionSettingsSchema.parse({
      preset: 'confirm_each',
      agentPresets: { codex: 'read_only' },
    });
    const updated = withAllowedBusinessAccess(settings, 'goal', 'create');

    expect(updated.preset).toBe('custom');
    expect(updated.agentPresets).toEqual({});
    expect(updated.customMatrix?.goal).toEqual({
      read: 'allow',
      create: 'allow',
      update: 'allow',
      delete: 'allow',
    });
    expect(updated.customMatrix?.task).toEqual({
      read: 'allow',
      create: 'ask',
      update: 'ask',
      delete: 'ask',
    });
    expect(settings.preset).toBe('confirm_each');
    expect(settings.customMatrix).toBeUndefined();
  });

  it('preserves existing per-object exceptions and the approved object read restriction', () => {
    const settings = PermissionSettingsSchema.parse({
      preset: 'custom',
      customMatrix: {
        goal: { read: 'deny', create: 'ask', update: 'ask', delete: 'ask' },
        task: { read: 'allow', create: 'deny', update: 'deny', delete: 'deny' },
      },
    });
    const updated = withAllowedBusinessAccess(settings, 'goal', 'update');
    expect(updated.customMatrix?.goal).toEqual({
      read: 'deny',
      create: 'allow',
      update: 'allow',
      delete: 'allow',
    });
    expect(updated.customMatrix?.task).toEqual({
      read: 'allow',
      create: 'deny',
      update: 'deny',
      delete: 'deny',
    });
    expect(settings.customMatrix?.goal?.create).toBe('ask');
  });

  it('allows a read request without silently changing write access', () => {
    const settings = PermissionSettingsSchema.parse({
      preset: 'custom',
      customMatrix: {
        knowledge: { read: 'ask', create: 'deny', update: 'deny', delete: 'deny' },
      },
    });
    const updated = withAllowedBusinessAccess(settings, 'knowledge', 'read');
    expect(updated.customMatrix?.knowledge).toEqual({
      read: 'allow',
      create: 'deny',
      update: 'deny',
      delete: 'deny',
    });
  });

  it('never authorizes AI to modify permission settings', () => {
    const settings = PermissionSettingsSchema.parse({ preset: 'full_auto' });
    expect(() => withAllowedBusinessAccess(settings, 'ai_permission', 'update')).toThrow();
  });
});
