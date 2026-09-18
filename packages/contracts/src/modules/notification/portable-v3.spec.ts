import { describe, expect, it } from 'vitest';
import {
  NotificationDeliveryPreferencePortablePayloadV3Schema,
  NotificationPortablePayloadV3Schema,
} from './portable-v3';

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

const notificationFact = {
  ref: 'notifications:1',
  workflowKey: 'routine.intervention',
  topic: 'routine.due',
  title: 'Routine due',
  content: 'Take a short break',
  type: 'Reminder',
  category: 'Reminder',
  importance: 'Important',
  urgency: 'High',
  relatedEntityType: null,
  relatedEntityId: null,
  navigationIntent: null,
  actions: [{ kind: 'archive', actionKey: 'archive', labelKey: 'archive' }],
  presentation: { icon: null, image: null, color: null },
  correlationId: null,
  causationId: null,
  readAt: null,
  archivedAt: null,
  expiresAt: null,
} as const;

describe('NotificationPortablePayloadV3', () => {
  it('accepts durable Fact/typed Interaction and excludes delivery/device fields', () => {
    const payload = NotificationPortablePayloadV3Schema.parse({
      facts: [notificationFact],
      interactions: [
        {
          ref: 'notifications:2',
          notificationRef: 'notifications:1',
          actionKey: 'archive',
          actionKind: 'archive',
          occurredAt: 1_758_000_000_000,
          commandReceiptId: null,
          outcome: 'accepted',
          correlationId: null,
          causationId: null,
        },
      ],
    });
    expect(payload.facts[0]).toEqual(notificationFact);
    expect(
      NotificationPortablePayloadV3Schema.safeParse({
        facts: [{ ...notificationFact, id: 'notification-db-id' }],
        interactions: [],
      }).success,
    ).toBe(false);
    expect(
      NotificationPortablePayloadV3Schema.safeParse({
        facts: [{ ...notificationFact, deliveryOutbox: [] }],
        interactions: [],
      }).success,
    ).toBe(false);
    expect(
      NotificationPortablePayloadV3Schema.safeParse({
        facts: [{ ...notificationFact, presentation: { icon: null, image: null, color: null, sound: 'ding' } }],
        interactions: [],
      }).success,
    ).toBe(false);
  });

  it('rejects interactions whose Fact reference is not in the same payload', () => {
    expect(
      NotificationPortablePayloadV3Schema.safeParse({
        facts: [notificationFact],
        interactions: [
          {
            ref: 'notifications:2',
            notificationRef: 'notifications:99',
            actionKey: 'archive',
            actionKind: 'archive',
            occurredAt: 1,
            commandReceiptId: null,
            outcome: 'accepted',
            correlationId: null,
            causationId: null,
          },
        ],
      }).success,
    ).toBe(false);
  });
});
