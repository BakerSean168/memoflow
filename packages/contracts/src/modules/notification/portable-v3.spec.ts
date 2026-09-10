import { describe, expect, it } from 'vitest';
import { NotificationDeliveryPreferencePortablePayloadV3Schema } from './portable-v3';

const canonical = {
  globalChannels: {
    InApp: true,
    Email: false,
    Push: true,
    Desktop: false,
    Sms: true,
    Webhook: false,
  },
  workflowOverrides: {
    'task.deadline': { Email: true, Desktop: true },
  },
};

describe('NotificationDeliveryPreferencePortablePayloadV3', () => {
  it('accepts only stable user-owned delivery choices', () => {
    expect(NotificationDeliveryPreferencePortablePayloadV3Schema.parse(canonical)).toEqual(
      canonical,
    );
  });

  it.each([
    ['identityId', 'identity-1'],
    ['id', 'notification-pref-1'],
    ['version', 7],
    ['createdAt', Date.now()],
    ['updatedAt', Date.now()],
    ['doNotDisturb', { enabled: true }],
    ['rateLimit', { enabled: true }],
    ['devicePresentation', { sound: true }],
  ])('rejects non-portable field %s', (key, value) => {
    expect(
      NotificationDeliveryPreferencePortablePayloadV3Schema.safeParse({
        ...canonical,
        [key]: value,
      }).success,
    ).toBe(false);
  });

  it('rejects unknown channel flags instead of silently broadening ownership', () => {
    expect(
      NotificationDeliveryPreferencePortablePayloadV3Schema.safeParse({
        ...canonical,
        globalChannels: { ...canonical.globalChannels, CarrierPigeon: true },
      }).success,
    ).toBe(false);
  });
});
