import { describe, expect, it } from 'vitest';
import { NotificationChannelType } from '@memoflow/contracts/notification';
import { asHm, requireTimeZoneId } from '@memoflow/time';
import { NotificationPreference } from '../notification-preference';
import { QuietHours } from '../../value-objects/quiet-hours';

const identityId = 'identity-pref' as never;

describe('NotificationPreference aggregate', () => {
  it('starts with no user overrides so workflow defaults remain authoritative', () => {
    const pref = NotificationPreference.create({ identityId });
    expect(pref.globalChannels.size).toBe(0);
    expect(pref.workflowOverrides.size).toBe(0);
    expect(pref.quietHours).toBeNull();
    expect(pref.toServerDTO()).not.toHaveProperty('rateLimit');
    expect(pref.toServerDTO()).not.toHaveProperty('doNotDisturb');
  });

  it('sets, reads and clears global/workflow channel preferences', () => {
    const pref = NotificationPreference.create({ identityId });
    pref.setGlobalChannel(NotificationChannelType.Email, false);
    expect(pref.getGlobalChannel(NotificationChannelType.Email)).toBe(false);
    pref.setWorkflowChannelOverride('task.deadline', NotificationChannelType.Desktop, true);
    expect(pref.getWorkflowChannelOverride('task.deadline', NotificationChannelType.Desktop)).toBe(true);
    pref.clearGlobalChannel(NotificationChannelType.Email);
    pref.clearWorkflowChannelOverride('task.deadline', NotificationChannelType.Desktop);
    expect(pref.getGlobalChannel(NotificationChannelType.Email)).toBeUndefined();
    expect(pref.workflowOverrides.has('task.deadline')).toBe(false);
  });

  it('returns defensive copies of preference maps', () => {
    const pref = NotificationPreference.create({ identityId });
    pref.setGlobalChannel(NotificationChannelType.Email, false);
    const globals = pref.globalChannels;
    globals.set(NotificationChannelType.Email, true);
    expect(pref.getGlobalChannel(NotificationChannelType.Email)).toBe(false);

    pref.setWorkflowChannelOverride('task.deadline', NotificationChannelType.Desktop, true);
    pref.workflowOverrides.get('task.deadline')?.set(NotificationChannelType.Desktop, false);
    expect(pref.getWorkflowChannelOverride('task.deadline', NotificationChannelType.Desktop)).toBe(true);
  });

  it('owns Product-Time QuietHours but no platform rate-limit state', () => {
    const pref = NotificationPreference.create({ identityId });
    const quiet = QuietHours.create({
      enabled: true,
      timeZone: requireTimeZoneId('Asia/Tokyo'),
      weeklyWindows: [{ daysOfWeek: [1, 2, 3, 4, 5], start: asHm('23:00'), end: asHm('07:00') }],
    });
    pref.setQuietHours(quiet);
    expect(pref.quietHours?.toDTO()).toEqual(quiet.toDTO());
    expect(pref.toServerDTO()).not.toHaveProperty('rateLimit');
  });

  it('serializes and reconstructs canonical preference layers', () => {
    const quiet = QuietHours.create({
      enabled: true,
      timeZone: requireTimeZoneId('UTC'),
      weeklyWindows: [{ daysOfWeek: [0], start: asHm('22:00'), end: asHm('08:00') }],
    });
    const pref = NotificationPreference.load({
      id: 'pref-1' as never,
      identityId,
      globalChannels: new Map([[NotificationChannelType.Email, false]]),
      workflowOverrides: new Map([
        ['task.deadline', new Map([[NotificationChannelType.Desktop, true]])],
      ]),
      quietHours: quiet,
      version: 2,
      deletedAt: null,
      createdAt: new Date('2026-08-25T00:00:00Z'),
      updatedAt: new Date('2026-08-25T01:00:00Z'),
    });
    const dto = pref.toServerDTO();
    expect(dto.globalChannels).toEqual({ Email: false });
    expect(dto.workflowOverrides).toEqual({ 'task.deadline': { Desktop: true } });
    expect(dto.quietHours).toEqual(quiet.toDTO());
    expect(pref.version).toBe(2);
  });
});
