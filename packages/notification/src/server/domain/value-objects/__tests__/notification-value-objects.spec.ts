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

  it('covers category preference validation, immutability, and effectiveness helpers', () => {
    const disabled = CategoryPreference.createDefault()
      .setEnabled(false)
      .updateChannels({ inApp: false, email: false, push: false, sms: false });

    expect(disabled.enabled).toBe(false);
    expect(disabled.hasAnyChannel).toBe(false);
    expect(disabled.isEffective).toBe(false);
    expect(disabled.channels).toEqual({ inApp: false, email: false, push: false, sms: false });
    expect(disabled.importance).toEqual(['Important', 'Moderate']);
    expect(CategoryPreference.createDefault().isEffective).toBe(true);
    expect(() => CategoryPreference.create({
      enabled: true,
      channels: null as never,
      importance: [],
    })).toThrow('Channels configuration is required');
  });

  it('covers enum helper validation and semantic classifiers', () => {
    expect(ContentType.getAll()).toContain(ContentType.Article);
    expect(ContentType.of('Video')).toBe(ContentType.Video);
    expect(ContentType.isValid('Image')).toBe(true);
    expect(ContentType.isValid('nope')).toBe(false);
    expect(ContentType.isMedia(ContentType.Video)).toBe(true);
    expect(ContentType.isMedia(ContentType.Image)).toBe(true);
    expect(ContentType.isMedia(ContentType.Article)).toBe(false);
    expect(ContentType.isDocumentation(ContentType.Article)).toBe(true);
    expect(ContentType.isDocumentation(ContentType.Resource)).toBe(true);
    expect(ContentType.isDocumentation(ContentType.Video)).toBe(false);
    expect(() => ContentType.of('nope')).toThrow('Invalid ContentType');

    expect(NotificationCategory.getAll()).toContain(NotificationCategory.System);
    expect(NotificationCategory.of('Task')).toBe(NotificationCategory.Task);
    expect(NotificationCategory.isValid('Goal')).toBe(true);
    expect(NotificationCategory.isValid('nope')).toBe(false);
    expect(NotificationCategory.isSystemCategory(NotificationCategory.System)).toBe(true);
    expect(NotificationCategory.isSystemCategory(NotificationCategory.Task)).toBe(false);
    expect(NotificationCategory.isBusiness(NotificationCategory.Task)).toBe(true);
    expect(NotificationCategory.isBusiness(NotificationCategory.System)).toBe(false);
    expect(NotificationCategory.isBusiness(NotificationCategory.Other)).toBe(false);
    expect(() => NotificationCategory.of('nope')).toThrow('Invalid NotificationCategory');

    expect(NotificationChannelType.getAll()).toContain(NotificationChannelType.Webhook);
    expect(NotificationChannelType.of('Desktop')).toBe(NotificationChannelType.Desktop);
    expect(NotificationChannelType.isValid('Email')).toBe(true);
    expect(NotificationChannelType.isValid('nope')).toBe(false);
    for (const realtime of [
      NotificationChannelType.InApp,
      NotificationChannelType.Push,
      NotificationChannelType.Sms,
      NotificationChannelType.Desktop,
    ]) {
      expect(NotificationChannelType.isRealtime(realtime)).toBe(true);
    }
    expect(NotificationChannelType.isRealtime(NotificationChannelType.Email)).toBe(false);
    expect(NotificationChannelType.isAsync(NotificationChannelType.Email)).toBe(true);
    expect(NotificationChannelType.isAsync(NotificationChannelType.Webhook)).toBe(true);
    expect(NotificationChannelType.isAsync(NotificationChannelType.InApp)).toBe(false);
    expect(() => NotificationChannelType.of('nope')).toThrow('Invalid NotificationChannelType');

    expect(NotificationType.getAll()).toContain(NotificationType.Social);
    expect(NotificationType.of('System')).toBe(NotificationType.System);
    expect(NotificationType.isValid('Error')).toBe(true);
    expect(NotificationType.isValid('nope')).toBe(false);
    expect(NotificationType.isSystemType(NotificationType.System)).toBe(true);
    expect(NotificationType.isSystemType(NotificationType.Info)).toBe(false);
    expect(NotificationType.isError(NotificationType.Error)).toBe(true);
    expect(NotificationType.isError(NotificationType.Info)).toBe(false);
    expect(() => NotificationType.of('nope')).toThrow('Invalid NotificationType');

    expect(RelatedEntityType.getAll()).toContain(RelatedEntityType.Reminder);
    expect(RelatedEntityType.of('Goal')).toBe(RelatedEntityType.Goal);
    expect(RelatedEntityType.isValid('Schedule')).toBe(true);
    expect(RelatedEntityType.isValid('nope')).toBe(false);
    expect(RelatedEntityType.isTimeRelated(RelatedEntityType.Schedule)).toBe(true);
    expect(RelatedEntityType.isTimeRelated(RelatedEntityType.Reminder)).toBe(true);
    expect(RelatedEntityType.isTimeRelated(RelatedEntityType.Task)).toBe(false);
    expect(RelatedEntityType.isGoalRelated(RelatedEntityType.Goal)).toBe(true);
    expect(RelatedEntityType.isGoalRelated(RelatedEntityType.Task)).toBe(false);
    expect(() => RelatedEntityType.of('nope')).toThrow('Invalid RelatedEntityType');
  });

  it('covers NotificationMetadata getters, derived flags, and immutable setters', () => {
    const metadata = NotificationMetadata.create({
      icon: 'bell',
      image: 'hero.png',
      color: '#123456',
      sound: 'ding',
      badge: 4,
      data: { source: 'test' },
    });

    expect(metadata.icon).toBe('bell');
    expect(metadata.image).toBe('hero.png');
    expect(metadata.color).toBe('#123456');
    expect(metadata.sound).toBe('ding');
    expect(metadata.badge).toBe(4);
    expect(metadata.data).toEqual({ source: 'test' });
    expect(metadata.hasIcon).toBe(true);
    expect(metadata.hasImage).toBe(true);
    expect(metadata.hasSound).toBe(true);
    expect(metadata.setIcon(null).hasIcon).toBe(false);
    expect(metadata.setColor(null).color).toBeNull();
    expect(metadata.setBadge(null).badge).toBeNull();
    expect(metadata.toDTO()).toEqual({
      icon: 'bell',
      image: 'hero.png',
      color: '#123456',
      sound: 'ding',
      badge: 4,
      data: { source: 'test' },
    });
  });

  it('rejects malformed typed notification actions and covers archive/navigate cloning', () => {
    expect(() => NotificationAction.create({
      kind: 'archive',
      actionKey: ' ',
      labelKey: 'archive',
    })).toThrow('Action actionKey is required');
    expect(() => NotificationAction.create({
      kind: 'archive',
      actionKey: 'archive',
      labelKey: ' ',
    })).toThrow('Action labelKey is required');
    expect(() => NotificationAction.create({
      kind: 'navigate',
      actionKey: 'open',
      labelKey: 'open',
      destination: { route: ' ' },
    })).toThrow('Navigate destination.route is required');
    expect(() => NotificationAction.create({
      kind: 'owner-command',
      actionKey: 'run',
      labelKey: 'run',
      owner: { type: '', id: 'owner-1' },
      commandKey: 'run',
    })).toThrow('Owner command owner reference is required');
    expect(() => NotificationAction.create({
      kind: 'owner-command',
      actionKey: 'run',
      labelKey: 'run',
      owner: { type: 'routine', id: 'owner-1' },
      commandKey: ' ',
    })).toThrow('Owner command commandKey is required');

    const archive = NotificationAction.create({
      kind: 'archive',
      actionKey: 'archive',
      labelKey: 'archive',
    });
    expect(archive.actionKey).toBe('archive');
    expect(archive.labelKey).toBe('archive');
    expect(archive.toDTO()).toEqual({ kind: 'archive', actionKey: 'archive', labelKey: 'archive' });

    const navigate = NotificationAction.create({
      kind: 'navigate',
      actionKey: 'open',
      labelKey: 'open',
      destination: { route: '/inbox' },
    });
    const dto = navigate.toDTO();
    expect(dto.kind).toBe('navigate');
    if (dto.kind === 'navigate') expect(dto.destination.params).toBeUndefined();
  });

  it('validates QuietHours configuration and covers daytime/disabled boundaries', () => {
    const utc = requireTimeZoneId('UTC');
    const disabled = QuietHours.disabled(utc);
    expect(disabled.isActiveAt(new Date('2026-09-17T12:00:00.000Z'))).toBe(false);
    expect(disabled.nextInactiveAt(new Date('2026-09-17T12:00:00.000Z'))).toBeNull();
    expect(QuietHours.fromDTO(disabled.toDTO()).toDTO()).toEqual(disabled.toDTO());

    const daytime = QuietHours.create({
      enabled: true,
      timeZone: utc,
      weeklyWindows: [{ daysOfWeek: [4], start: asHm('09:00'), end: asHm('17:00') }],
    });
    expect(daytime.isActiveAt(new Date('2026-09-17T10:00:00.000Z'))).toBe(true);
    expect(daytime.nextInactiveAt(new Date('2026-09-17T10:00:00.000Z'))?.toISOString())
      .toBe('2026-09-17T17:00:00.000Z');
    expect(daytime.isActiveAt(new Date('2026-09-17T18:00:00.000Z'))).toBe(false);
    expect(daytime.nextInactiveAt(new Date('2026-09-17T18:00:00.000Z'))).toBeNull();

    expect(() => QuietHours.create({
      enabled: true,
      timeZone: 'Not/AZone' as never,
      weeklyWindows: [],
    })).toThrow('Invalid QuietHours timeZone');
    expect(() => QuietHours.create({
      enabled: true,
      timeZone: utc,
      weeklyWindows: [{ daysOfWeek: [], start: asHm('09:00'), end: asHm('10:00') }],
    })).toThrow('requires at least one weekday');
    expect(() => QuietHours.create({
      enabled: true,
      timeZone: utc,
      weeklyWindows: [{ daysOfWeek: [4], start: '9:00' as never, end: asHm('10:00') }],
    })).toThrow('must use HH:mm');
    expect(() => QuietHours.create({
      enabled: true,
      timeZone: utc,
      weeklyWindows: [{ daysOfWeek: [4], start: asHm('09:00'), end: asHm('09:00') }],
    })).toThrow('must differ');
    expect(() => QuietHours.create({
      enabled: true,
      timeZone: utc,
      weeklyWindows: [{ daysOfWeek: [7 as never], start: asHm('09:00'), end: asHm('10:00') }],
    })).toThrow('weekday must be 0-6');
  });
});
