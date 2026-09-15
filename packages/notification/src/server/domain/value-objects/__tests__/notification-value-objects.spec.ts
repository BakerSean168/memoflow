import {
  CategoryPreference,
  ChannelError,
  ChannelStatus,
  ChannelResponse,
  ContentType,
  DoNotDisturbConfig,
  NotificationAction,
  NotificationActionType,
  NotificationCategory,
  NotificationChannelType,
  NotificationMetadata,
  NotificationType,
  RateLimit,
  RelatedEntityType,
} from '..';
import { createTimeContext } from '@memoflow/time';

const TOKYO_TIME_CONTEXT = createTimeContext({ timeZone: 'Asia/Tokyo', weekStartsOn: 1 });
const NEW_YORK_TIME_CONTEXT = createTimeContext({
  timeZone: 'America/New_York',
  weekStartsOn: 0,
});

describe('notification shared value objects', () => {
  it('handles category preferences and quiet hours', () => {
    const preference = CategoryPreference.createDefault()
      .updateChannels({ email: true })
      .setImportance(['Critical']);

    expect(preference.enabled).toBe(true);
    expect(preference.channels.email).toBe(true);
    expect(preference.importance).toEqual(['Critical']);
    expect(preference.hasAnyChannel).toBe(true);
    expect(preference.isEffective).toBe(true);
    expect(CategoryPreference.fromDTO(preference.toDTO()).toDTO()).toEqual(preference.toDTO());

    const disabled = preference.setEnabled(false).updateChannels({
      inApp: false,
      email: false,
      push: false,
      sms: false,
    });
    expect(disabled.hasAnyChannel).toBe(false);
    expect(disabled.isEffective).toBe(false);
    expect(() => CategoryPreference.create({ enabled: true, importance: ['Critical'] } as never))
      .toThrow('Channels configuration is required');

    const quiet = DoNotDisturbConfig.createNightMode()
      .setTimeRange('21:00', '06:00')
      .setDaysOfWeek([1, 2, 3, 4, 5]);

    expect(quiet.enabled).toBe(true);
    expect(quiet.daysOfWeek).toEqual([1, 2, 3, 4, 5]);
    expect(quiet.isWeekdaysOnly).toBe(true);
    expect(quiet.isWeekendsOnly).toBe(false);
    expect(quiet.isEveryDay).toBe(false);
    expect(quiet.isActiveAt(new Date('2026-04-27T13:15:00.000Z'), TOKYO_TIME_CONTEXT)).toBe(true);
    expect(quiet.isActiveAt(new Date('2026-04-27T03:00:00.000Z'), TOKYO_TIME_CONTEXT)).toBe(false);
    expect(DoNotDisturbConfig.createDefault().isEveryDay).toBe(true);
    expect(DoNotDisturbConfig.createDefault()
        .setEnabled(false)
        .isActiveAt(new Date(), TOKYO_TIME_CONTEXT)).toBe(false);
    expect(
      DoNotDisturbConfig.create({
        enabled: true,
        startTime: '09:00',
        endTime: '17:00',
        daysOfWeek: [0, 6],
      }).isWeekendsOnly,
    ).toBe(true);
    expect(
      () =>
        DoNotDisturbConfig.create({
          enabled: true,
          startTime: '25:00',
          endTime: '08:00',
          daysOfWeek: [1],
        }),
    ).toThrow('Invalid startTime format');
    expect(
      () =>
        DoNotDisturbConfig.create({
          enabled: true,
          startTime: '08:00',
          endTime: '09:00',
          daysOfWeek: [7],
        }),
    ).toThrow('daysOfWeek values must be 0-6');
  });

  it('evaluates DND in canonical user time and preserves wall-clock end across DST', () => {
    const dnd = DoNotDisturbConfig.create({
      enabled: true,
      startTime: '22:00',
      endTime: '08:00',
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    });
    // New York: 2030-03-09 23:00 EST -> 2030-03-10 08:00 EDT.
    const activeAt = new Date('2030-03-10T04:00:00.000Z');

    const previousHostTz = process.env.TZ;
    try {
      process.env.TZ = 'UTC';
      const utcHost = dnd.isActiveAt(activeAt, NEW_YORK_TIME_CONTEXT);
      const utcHostEnd = dnd.nextInactiveAt(activeAt, NEW_YORK_TIME_CONTEXT);

      process.env.TZ = 'Asia/Tokyo';
      const tokyoHost = dnd.isActiveAt(activeAt, NEW_YORK_TIME_CONTEXT);
      const tokyoHostEnd = dnd.nextInactiveAt(activeAt, NEW_YORK_TIME_CONTEXT);

      expect(utcHost).toBe(true);
      expect(tokyoHost).toBe(utcHost);
      expect(utcHostEnd?.toISOString()).toBe('2030-03-10T12:00:00.000Z');
      expect(tokyoHostEnd?.toISOString()).toBe(utcHostEnd?.toISOString());
      expect(utcHostEnd!.getTime() - activeAt.getTime()).toBe(8 * 60 * 60 * 1000);
    } finally {
      if (previousHostTz === undefined) delete process.env.TZ;
      else process.env.TZ = previousHostTz;
    }
  });

  it('serializes metadata, limits, actions, and channel payloads', () => {
    const metadata = NotificationMetadata.createDefault()
      .setIcon('bell')
      .setColor('#fff')
      .setBadge(3);
    expect(metadata.hasIcon).toBe(true);
    expect(metadata.hasImage).toBe(false);
    expect(metadata.hasSound).toBe(false);
    expect(NotificationMetadata.fromDTO(metadata.toDTO()).toDTO()).toEqual(metadata.toDTO());

    const limit = RateLimit.createDefault().setLimits(5, 10);
    expect(limit.enabled).toBe(true);
    expect(limit.wouldExceed(5, 0)).toBe(true);
    expect(limit.wouldExceed(0, 10)).toBe(true);
    expect(limit.setEnabled(false).wouldExceed(100, 100)).toBe(false);
    expect(RateLimit.fromDTO(limit.toDTO()).toDTO()).toEqual(limit.toDTO());
    expect(RateLimit.createUnlimited().isUnlimited).toBe(true);
    expect(() => RateLimit.create({ enabled: true, maxPerHour: -1, maxPerDay: 5 })).toThrow(
      'maxPerHour must be non-negative',
    );
    expect(() => RateLimit.create({ enabled: true, maxPerHour: 10, maxPerDay: -1 })).toThrow(
      'maxPerDay must be non-negative',
    );
    expect(() => RateLimit.create({ enabled: true, maxPerHour: 10, maxPerDay: 5 })).toThrow(
      'maxPerHour cannot exceed maxPerDay',
    );

    const error = ChannelError.of('TIMEOUT', 'retry later', { retryAfter: 10 });
    expect(error.code).toBe('TIMEOUT');
    expect(error.message).toBe('retry later');
    expect(error.hasDetails).toBe(true);
    expect(error.isRetryable).toBe(true);
    expect(ChannelError.fromDTO(error.toDTO()).toDTO()).toEqual(error.toDTO());
    expect(() => ChannelError.create({ code: '', message: 'x' })).toThrow('Error code is required');
    expect(() => ChannelError.create({ code: 'X', message: '' })).toThrow('Error message is required');

    const response = ChannelResponse.success('msg-1', { ok: true });
    expect(response.messageId).toBe('msg-1');
    expect(response.statusCode).toBe(200);
    expect(response.isSuccess).toBe(true);
    expect(response.hasMessageId).toBe(true);
    expect(response.hasData).toBe(true);
    expect(ChannelResponse.fromDTO(response.toDTO()).toDTO()).toEqual(response.toDTO());
    expect(ChannelResponse.create({ messageId: null, statusCode: null }).isSuccess).toBe(false);
    expect(ChannelResponse.failed(500).hasMessageId).toBe(false);
    expect(ChannelResponse.failed(500).hasData).toBe(false);

    const action = NotificationAction.of('open', 'Open', NotificationActionType.Navigate, {
      href: '/x',
    });
    expect(action.id).toBe('open');
    expect(action.label).toBe('Open');
    expect(action.type).toBe(NotificationActionType.Navigate);
    expect(action.payload).toEqual({ href: '/x' });
    expect(NotificationAction.fromDTO(action.toDTO()).toDTO()).toEqual(action.toDTO());
    expect(() =>
      NotificationAction.create({
        id: '',
        label: 'Open',
        type: NotificationActionType.Navigate,
      }),
    ).toThrow('Action ID is required');
    expect(() =>
      NotificationAction.create({
        id: 'open',
        label: '',
        type: NotificationActionType.Navigate,
      }),
    ).toThrow('Action label is required');
  });

  it('covers delivery-channel status, content, and routing enum helpers', () => {
    expect(ChannelStatus.getAll()).toEqual([
      ChannelStatus.Pending,
      ChannelStatus.Sent,
      ChannelStatus.Delivered,
      ChannelStatus.Failed,
      ChannelStatus.Cancelled,
    ]);
    expect(ChannelStatus.of('Pending')).toBe(ChannelStatus.Pending);
    expect(ChannelStatus.isSuccessful(ChannelStatus.Delivered)).toBe(true);
    expect(ChannelStatus.isFailed(ChannelStatus.Failed)).toBe(true);
    expect(ChannelStatus.isProcessing(ChannelStatus.Sent)).toBe(true);
    expect(() => ChannelStatus.of('Unknown')).toThrow('Invalid ChannelStatus');

    expect(ContentType.getAll()).toContain(ContentType.Article);
    expect(ContentType.of('Video')).toBe(ContentType.Video);
    expect(ContentType.isMedia(ContentType.Video)).toBe(true);
    expect(ContentType.isDocumentation(ContentType.Article)).toBe(true);
    expect(() => ContentType.of('Bad')).toThrow('Invalid ContentType');

    expect(NotificationActionType.getAll()).toContain(NotificationActionType.Custom);
    expect(NotificationActionType.of('ApiCall')).toBe(NotificationActionType.ApiCall);
    expect(NotificationActionType.isNavigation(NotificationActionType.Navigate)).toBe(true);
    expect(NotificationActionType.isApiCall(NotificationActionType.ApiCall)).toBe(true);
    expect(NotificationActionType.needsProcessing(NotificationActionType.Custom)).toBe(true);
    expect(() => NotificationActionType.of('Bad')).toThrow('Invalid NotificationActionType');

    expect(NotificationCategory.getAll()).toContain(NotificationCategory.System);
    expect(NotificationCategory.of('Task')).toBe(NotificationCategory.Task);
    expect(NotificationCategory.isSystemCategory(NotificationCategory.System)).toBe(true);
    expect(NotificationCategory.isBusiness(NotificationCategory.Goal)).toBe(true);
    expect(() => NotificationCategory.of('Bad')).toThrow('Invalid NotificationCategory');

    expect(NotificationChannelType.getAll()).toContain(NotificationChannelType.Webhook);
    expect(NotificationChannelType.of('Email')).toBe(NotificationChannelType.Email);
    expect(NotificationChannelType.isRealtime(NotificationChannelType.Push)).toBe(true);
    expect(NotificationChannelType.isAsync(NotificationChannelType.Webhook)).toBe(true);
    expect(() => NotificationChannelType.of('Bad')).toThrow('Invalid NotificationChannelType');

    expect(NotificationType.getAll()).toContain(NotificationType.Social);
    expect(NotificationType.of('Error')).toBe(NotificationType.Error);
    expect(NotificationType.isSystemType(NotificationType.System)).toBe(true);
    expect(NotificationType.isError(NotificationType.Error)).toBe(true);
    expect(() => NotificationType.of('Bad')).toThrow('Invalid NotificationType');

    expect(RelatedEntityType.getAll()).toContain(RelatedEntityType.Reminder);
    expect(RelatedEntityType.of('Goal')).toBe(RelatedEntityType.Goal);
    expect(RelatedEntityType.isTimeRelated(RelatedEntityType.Schedule)).toBe(true);
    expect(RelatedEntityType.isGoalRelated(RelatedEntityType.Goal)).toBe(true);
    expect(() => RelatedEntityType.of('Bad')).toThrow('Invalid RelatedEntityType');
  });
});
