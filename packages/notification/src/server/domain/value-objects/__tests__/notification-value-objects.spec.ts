import { describe, expect, it } from 'vitest';
import {
  CategoryPreference,
  ContentType,
  NotificationAction,
  NotificationCategory,
  NotificationChannelType,
  NotificationMetadata,
  NotificationType,
  QuietHours,
  RelatedEntityType,
} from '..';
import { asHm, requireTimeZoneId } from '@memoflow/time';

describe('notification shared value objects', () => {
  it('handles category preferences without owning delivery execution state', () => {
    const preference = CategoryPreference.createDefault()
      .updateChannels({ email: true })
      .setImportance(['Critical']);

    expect(preference.enabled).toBe(true);
    expect(preference.channels.email).toBe(true);
    expect(preference.importance).toEqual(['Critical']);
    expect(CategoryPreference.fromDTO(preference.toDTO()).toDTO()).toEqual(preference.toDTO());
  });

  it('evaluates QuietHours from its explicit IANA timezone, independent of host timezone', () => {
    const quiet = QuietHours.create({
      enabled: true,
      timeZone: requireTimeZoneId('America/New_York'),
      weeklyWindows: [{ daysOfWeek: [6], start: asHm('22:00'), end: asHm('08:00') }],
    });
    // Saturday 2030-03-09 23:00 EST. The window ends Sunday 08:00 EDT after DST jumps.
    const activeAt = new Date('2030-03-10T04:00:00.000Z');

    const previousHostTz = process.env.TZ;
    try {
      process.env.TZ = 'UTC';
      const utcHostActive = quiet.isActiveAt(activeAt);
      const utcHostEnd = quiet.nextInactiveAt(activeAt);

      process.env.TZ = 'Asia/Tokyo';
      const tokyoHostActive = quiet.isActiveAt(activeAt);
      const tokyoHostEnd = quiet.nextInactiveAt(activeAt);

      expect(utcHostActive).toBe(true);
      expect(tokyoHostActive).toBe(true);
      expect(utcHostEnd?.toISOString()).toBe('2030-03-10T12:00:00.000Z');
      expect(tokyoHostEnd?.toISOString()).toBe(utcHostEnd?.toISOString());
    } finally {
      if (previousHostTz === undefined) delete process.env.TZ;
      else process.env.TZ = previousHostTz;
    }
  });

  it('uses the start weekday for the after-midnight half of a weekly window', () => {
    const quiet = QuietHours.create({
      enabled: true,
      timeZone: requireTimeZoneId('Asia/Tokyo'),
      weeklyWindows: [{ daysOfWeek: [1], start: asHm('23:00'), end: asHm('07:00') }],
    });

    expect(quiet.isActiveAt(new Date('2026-08-24T15:30:00.000Z'))).toBe(true); // Tue 00:30 JST, Monday window.
    expect(quiet.isActiveAt(new Date('2026-08-25T15:30:00.000Z'))).toBe(false); // Wed 00:30 JST.
  });

  it('serializes metadata and typed actions without generic ApiCall/Custom payloads', () => {
    const metadata = NotificationMetadata.createDefault().setIcon('bell').setColor('#fff').setBadge(3);
    expect(NotificationMetadata.fromDTO(metadata.toDTO()).toDTO()).toEqual(metadata.toDTO());

    const navigate = NotificationAction.create({
      kind: 'navigate',
      actionKey: 'open',
      labelKey: 'notification.action.open',
      destination: { route: '/tasks/1', params: { from: 'notification' } },
    });
    expect(NotificationAction.fromDTO(navigate.toDTO()).toDTO()).toEqual(navigate.toDTO());

    const owner = NotificationAction.create({
      kind: 'owner-command',
      actionKey: 'complete',
      labelKey: 'routine.action.complete',
      owner: { type: 'routine-occurrence', id: 'occ-1' },
      commandKey: 'routine.complete',
      input: { routineId: 'routine-1', occurrenceKey: 'occ-1' },
    });
    expect(owner.kind).toBe('owner-command');

    expect(() => NotificationAction.create({
      kind: 'owner-command',
      actionKey: 'bad',
      labelKey: 'bad',
      owner: { type: 'routine-occurrence', id: 'occ-1' },
      commandKey: 'routine.complete',
      input: (() => undefined) as never,
    })).toThrow('Owner command input must be a JSON value');
  });

  it('covers remaining notification enum helpers', () => {
    expect(ContentType.getAll()).toContain(ContentType.Article);
    expect(NotificationCategory.getAll()).toContain(NotificationCategory.System);
    expect(NotificationChannelType.getAll()).toContain(NotificationChannelType.Webhook);
    expect(NotificationType.getAll()).toContain(NotificationType.Social);
    expect(RelatedEntityType.getAll()).toContain(RelatedEntityType.Reminder);
  });
});
