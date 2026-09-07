import { describe, it, expect } from 'vitest';
import { ReminderPolicy } from '../reminder-policy';
import { ReminderTemplate } from '../../aggregates/reminder-template';
import type { ReminderTemplateState } from '../../aggregates/reminder-template';
import { ReminderGroup } from '../../aggregates/reminder-group';
import type { ReminderGroupState } from '../../aggregates/reminder-group';
import { ReminderStatus, ReminderType } from '@memoflow/contracts/reminder';
import { ImportanceLevel } from '@memoflow/contracts/shared';
import { ReminderTemplateId } from '../../value-objects/reminder-template-id';
import { IdentityId } from '@memoflow/domain-shared';
import { TriggerConfig, ActiveTimeConfig, GroupStats } from '../../value-objects';
import { ReminderNotificationConfig } from '../../value-objects/reminder-notification-config';
import { generateUUID } from '@memoflow/utils/shared';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SHARED_IDENTITY = IdentityId.generate();

function makeTemplateState(overrides: Partial<ReminderTemplateState> = {}): ReminderTemplateState {
  const now = Date.now();
  return {
    id: ReminderTemplateId.generate(),
    identityId: IdentityId.of(SHARED_IDENTITY),
    title: 'Policy Test',
    description: null,
    type: ReminderType.Recurring,
    trigger: TriggerConfig.createFixedTime('08:00'),
    activeTime: ActiveTimeConfig.createAt(now),
    activeHours: null,
    notificationConfig: ReminderNotificationConfig.createDefault(),
    selfEnabled: true,
    status: ReminderStatus.Active,
    groupId: null,
    effectiveEnabled: true,
    importanceLevel: ImportanceLevel.Moderate,
    tags: [],
    color: null,
    icon: null,
    nextTriggerAt: now + 3_600_000,
    createdAt: new Date(now),
    updatedAt: new Date(now),
    deletedAt: null,
    version: 1,
    history: [],
    ...overrides,
  };
}

function makeGroupState(overrides: Partial<ReminderGroupState> = {}): ReminderGroupState {
  const now = new Date();
  return {
    id: generateUUID(),
    identityId: SHARED_IDENTITY,
    name: 'Policy Group',
    description: null,
    enabled: true,
    status: ReminderStatus.Active,
    order: 0,
    color: null,
    icon: null,
    stats: GroupStats.createEmpty(),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    version: 1,
    ...overrides,
  };
}

// ===========================================================================
// Tests
// ===========================================================================

describe('ReminderPolicy', () => {
  const policy = new ReminderPolicy();

  // -----------------------------------------------------------------------
  // calculateEffectiveEnabled()
  // -----------------------------------------------------------------------
  describe('calculateEffectiveEnabled()', () => {
    it('should return template status when no group', () => {
      const active = ReminderTemplate.load(makeTemplateState({ status: ReminderStatus.Active }));
      expect(policy.calculateEffectiveEnabled(active, null)).toBe(true);

      const paused = ReminderTemplate.load(makeTemplateState({ status: ReminderStatus.Paused }));
      expect(policy.calculateEffectiveEnabled(paused, null)).toBe(false);
    });

    it('should allow execution when Routine and Profile gates are active', () => {
      const template = ReminderTemplate.load(makeTemplateState({ status: ReminderStatus.Active }));
      const group = ReminderGroup.load(
        makeGroupState({
          status: ReminderStatus.Active,
        }),
      );

      expect(policy.calculateEffectiveEnabled(template, group)).toBe(true);
    });

    it('should close execution when the Profile gate is paused', () => {
      const template = ReminderTemplate.load(makeTemplateState({ status: ReminderStatus.Active }));
      const group = ReminderGroup.load(
        makeGroupState({
          status: ReminderStatus.Paused,
        }),
      );

      expect(policy.calculateEffectiveEnabled(template, group)).toBe(false);
    });

    it('should AND Profile and Routine state when both are active', () => {
      const template = ReminderTemplate.load(makeTemplateState({ status: ReminderStatus.Active }));
      const group = ReminderGroup.load(
        makeGroupState({
          status: ReminderStatus.Active,
        }),
      );

      expect(policy.calculateEffectiveEnabled(template, group)).toBe(true);
    });

    it('should return false when the Profile gate is paused', () => {
      const template = ReminderTemplate.load(makeTemplateState({ status: ReminderStatus.Active }));
      const group = ReminderGroup.load(
        makeGroupState({
          status: ReminderStatus.Paused,
        }),
      );

      expect(policy.calculateEffectiveEnabled(template, group)).toBe(false);
    });

    it('should return false when the Routine is paused', () => {
      const template = ReminderTemplate.load(makeTemplateState({ status: ReminderStatus.Paused }));
      const group = ReminderGroup.load(
        makeGroupState({
          status: ReminderStatus.Active,
        }),
      );

      expect(policy.calculateEffectiveEnabled(template, group)).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // assertValidGroupAssignment()
  // -----------------------------------------------------------------------
  describe('assertValidGroupAssignment()', () => {
    it('should not throw when group is null', () => {
      const template = ReminderTemplate.load(makeTemplateState());
      expect(() => policy.assertValidGroupAssignment(template, null)).not.toThrow();
    });

    it('should not throw when identities match', () => {
      const template = ReminderTemplate.load(
        makeTemplateState({ identityId: SHARED_IDENTITY }),
      );
      const group = ReminderGroup.load(makeGroupState({ identityId: SHARED_IDENTITY }));

      expect(() => policy.assertValidGroupAssignment(template, group)).not.toThrow();
    });

    it('should throw when identities do not match', () => {
      const anotherIdentity = IdentityId.generate();
      const differentIdentity = IdentityId.generate();
      const template = ReminderTemplate.load(
        makeTemplateState({ identityId: IdentityId.of(String(anotherIdentity)) }),
      );
      const group = ReminderGroup.load(makeGroupState({ identityId: differentIdentity }));

      expect(() => policy.assertValidGroupAssignment(template, group)).toThrow(
        'Reminder template and group must belong to the same identity',
      );
    });
  });

  // -----------------------------------------------------------------------
  // assertTemplateDeletable()
  // -----------------------------------------------------------------------
  describe('assertTemplateDeletable()', () => {
    it('should not throw for non-deleted template (soft delete)', () => {
      const template = ReminderTemplate.load(makeTemplateState({ deletedAt: null }));
      expect(() => policy.assertTemplateDeletable(template, false)).not.toThrow();
    });

    it('should throw for already-deleted template (soft delete)', () => {
      const template = ReminderTemplate.load(makeTemplateState({ deletedAt: Date.now() }));
      expect(() => policy.assertTemplateDeletable(template, false)).toThrow(
        'Reminder template is already deleted',
      );
    });

    it('should not throw for already-deleted template (hard delete)', () => {
      const template = ReminderTemplate.load(makeTemplateState({ deletedAt: Date.now() }));
      expect(() => policy.assertTemplateDeletable(template, true)).not.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // assertCanTrigger()
  // -----------------------------------------------------------------------
  describe('assertCanTrigger()', () => {
    it('should not throw when template is effectively enabled', () => {
      const template = ReminderTemplate.load(makeTemplateState({ status: ReminderStatus.Active }));
      expect(() => policy.assertCanTrigger(template, null)).not.toThrow();
    });

    it('should throw when template is not effectively enabled', () => {
      const template = ReminderTemplate.load(makeTemplateState({ status: ReminderStatus.Paused }));
      expect(() => policy.assertCanTrigger(template, null)).toThrow(
        'Reminder template is not enabled',
      );
    });

    it('should throw when the Profile gate is paused', () => {
      const template = ReminderTemplate.load(makeTemplateState({ status: ReminderStatus.Active }));
      const group = ReminderGroup.load(
        makeGroupState({
          status: ReminderStatus.Paused,
        }),
      );

      expect(() => policy.assertCanTrigger(template, group)).toThrow(
        'Reminder template is not enabled',
      );
    });
  });
});
