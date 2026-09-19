import { describe, expect, it } from 'vitest';
import { NotificationChannelType } from '@memoflow/contracts/notification';
import { asHm, requireTimeZoneId } from '@memoflow/time';
import { NotificationPreference } from '../../../../../domain/aggregates/notification-preference';
import { QuietHours } from '../../../../../domain/value-objects/quiet-hours';
import { NotificationPreferencePrismaMapper } from '../notification-preference-prisma.mapper';

describe('NotificationPreferencePrismaMapper vNext hierarchy', () => {
  it('round-trips global/workflow preference layers plus QuietHours only', () => {
    const preference = NotificationPreference.create({ identityId: 'identity-policy-roundtrip' as never });
    preference.setGlobalChannel(NotificationChannelType.Email, false);
    preference.setWorkflowChannelOverride('system.weekly-digest', NotificationChannelType.Email, true);
    preference.setQuietHours(QuietHours.create({
      enabled: true,
      timeZone: requireTimeZoneId('Asia/Tokyo'),
      weeklyWindows: [{ daysOfWeek: [1, 2, 3, 4, 5], start: asHm('22:30'), end: asHm('07:45') }],
    }));

    const persisted = NotificationPreferencePrismaMapper.toPersistence(preference);
    const dto = persisted.dto;
    const loaded = NotificationPreferencePrismaMapper.toDomain({
      id: String(dto.id), identityId: String(dto.identityId),
      globalChannels: persisted.globalChannels,
      workflowOverrides: persisted.workflowOverrides,
      quietHours: persisted.quietHours,
      version: dto.version,
      createdAt: new Date(dto.createdAt), updatedAt: new Date(dto.updatedAt), deletedAt: null,
    });

    expect(loaded.getGlobalChannel(NotificationChannelType.Email)).toBe(false);
    expect(loaded.getWorkflowChannelOverride('system.weekly-digest', NotificationChannelType.Email)).toBe(true);
    expect(loaded.quietHours?.toDTO()).toEqual(preference.quietHours?.toDTO());
    expect(persisted).not.toHaveProperty('doNotDisturb');
    expect(persisted).not.toHaveProperty('rateLimit');
  });
});
