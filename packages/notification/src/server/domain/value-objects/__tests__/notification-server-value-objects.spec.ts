import { CategoryPreference } from '../category-preference';
import { DoNotDisturbConfig } from '../do-not-disturb-config';
import { NotificationAction } from '../notification-action';
import { NotificationMetadata } from '../notification-metadata';
import { RateLimit } from '../rate-limit';
import { NotificationActionType } from '../notification-action-type';

describe('notification server value object re-exports', () => {
  it('exposes shared implementations through server paths', () => {
    expect(CategoryPreference.createDefault().enabled).toBe(true);
    expect(DoNotDisturbConfig.createDefault().startTime).toBe('22:00');
    expect(NotificationAction.of('open', 'Open', NotificationActionType.Navigate).label).toBe(
      'Open',
    );
    expect(NotificationMetadata.createDefault().badge).toBeNull();
    expect(RateLimit.createUnlimited().isUnlimited).toBe(true);
  });
});
