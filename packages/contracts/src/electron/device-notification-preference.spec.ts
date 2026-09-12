import { describe, expect, it } from 'vitest';
import {
  DesktopNotificationPreferencePatchSchema,
  DesktopNotificationPreferenceSchema,
} from './device-notification-preference';

describe('desktop notification preference schemas', () => {
  it('accepts canonical full preferences and partial patches', () => {
    expect(
      DesktopNotificationPreferenceSchema.safeParse({
        presentationMode: 'custom',
        soundEnabled: true,
      }).success,
    ).toBe(true);
    expect(DesktopNotificationPreferencePatchSchema.safeParse({ presentationMode: 'native' }).success).toBe(true);
    expect(DesktopNotificationPreferencePatchSchema.safeParse({}).success).toBe(true);
  });

  it('rejects invalid values and unknown keys', () => {
    expect(DesktopNotificationPreferenceSchema.safeParse({ presentationMode: 'system', soundEnabled: true }).success).toBe(false);
    expect(DesktopNotificationPreferencePatchSchema.safeParse({ soundEnabled: 'yes' }).success).toBe(false);
    expect(DesktopNotificationPreferencePatchSchema.safeParse({ typo: true }).success).toBe(false);
  });
});
