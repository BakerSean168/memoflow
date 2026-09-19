import { CategoryPreference } from '../category-preference';
import { NotificationAction } from '../notification-action';
import { NotificationMetadata } from '../notification-metadata';
import { QuietHours } from '../quiet-hours';
import { asHm, requireTimeZoneId } from '@memoflow/time';

describe('notification server value object re-exports', () => {
  it('exposes typed action and Product-Time QuietHours through server paths', () => {
    expect(CategoryPreference.createDefault().enabled).toBe(true);
    expect(NotificationMetadata.createDefault().badge).toBeNull();
    expect(NotificationAction.create({
      kind: 'archive',
      actionKey: 'archive',
      labelKey: 'notification.action.archive',
    }).kind).toBe('archive');
    expect(QuietHours.create({
      enabled: true,
      timeZone: requireTimeZoneId('UTC'),
      weeklyWindows: [{ daysOfWeek: [1], start: asHm('22:00'), end: asHm('08:00') }],
    }).enabled).toBe(true);
  });
});
