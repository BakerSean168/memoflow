import { describe, it, expect } from 'vitest';
import { ReminderTemplate } from '../reminder-template';
import type { ReminderTemplateState } from '../reminder-template';
import { IdentityId } from '@memoflow/domain-shared';
import { ReminderTemplateId } from '../../value-objects/reminder-template-id';
import {
  TriggerConfig,
  ActiveTimeConfig,
  ResponseMetrics,
  FrequencyAdjustment,
} from '../../value-objects';
import { ReminderNotificationConfig } from '../../value-objects/reminder-notification-config';
import { ReminderStatus, ReminderType, TriggerResult } from '@memoflow/contracts/reminder';
import { ImportanceLevel } from '@memoflow/contracts/shared';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(overrides: Partial<ReminderTemplateState> = {}): ReminderTemplateState {
  const now = Date.now();
  return {
    id: ReminderTemplateId.generate(),
    identityId: IdentityId.generate(),
    title: 'Test Reminder',
    description: null,
    type: ReminderType.Recurring,
    trigger: TriggerConfig.createFixedTime('08:00'),
    activeTime: ActiveTimeConfig.createAt(now - 60_000),
    activeHours: null,
    notificationConfig: ReminderNotificationConfig.createDefault(),
    selfEnabled: true,
    status: ReminderStatus.Active,
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
    responseMetrics: null,
    frequencyAdjustment: null,
    smartFrequencyEnabled: true,
    history: [],
    ...overrides,
  };
}

function createDefaultTemplate() {
  return ReminderTemplate.create({
    identityId: IdentityId.generate(),
    title: 'Daily Standup',
    type: ReminderType.Recurring,
    trigger: { type: 'FixedTime', fixedTime: { time: '09:00', timezone: null }, interval: null },
    activeTime: { activatedAt: Date.now() },
    notificationConfig: {
      channels: ['InApp'],
      title: null,
      body: null,
      sound: { enabled: true, soundName: null },
      vibration: { enabled: true, pattern: null },
      actions: null,
    },
  });
}

// ===========================================================================
// Tests
// ===========================================================================

describe('ReminderTemplate aggregate', () => {
  // -----------------------------------------------------------------------
  // Factory: create()
  // -----------------------------------------------------------------------
  describe('create()', () => {
    it('should create a template with required fields', () => {
      const template = createDefaultTemplate();

      expect(template.title).toBe('Daily Standup');
      expect(template.type).toBe(ReminderType.Recurring);
      expect(template.selfEnabled).toBe(true);
      expect(template.status).toBe(ReminderStatus.Active);
      expect(template.effectiveEnabled).toBe(true);
      expect(template.version).toBe(1);
      expect(template.deletedAt).toBeNull();
    });

    it('should generate a unique id', () => {
      const t1 = createDefaultTemplate();
      const t2 = createDefaultTemplate();

      expect(t1.id).toBeDefined();
      expect(t2.id).toBeDefined();
      expect(t1.id).not.toBe(t2.id);
    });

    it('should apply optional fields when provided', () => {
      const template = ReminderTemplate.create({
        identityId: IdentityId.generate(),
        title: 'With Extras',
        type: ReminderType.OneTime,
        trigger: {
          type: 'FixedTime',
          fixedTime: { time: '10:00', timezone: null },
          interval: null,
        },
        activeTime: { activatedAt: Date.now() },
        notificationConfig: {
          channels: ['InApp'],
          title: null,
          body: null,
          sound: null,
          vibration: null,
          actions: null,
        },
        description: 'A description',
        importanceLevel: ImportanceLevel.Vital,
        tags: ['work', 'urgent'],
        color: '#FF0000',
        icon: 'bell',
      });

      expect(template.description).toBe('A description');
      expect(template.importanceLevel).toBe(ImportanceLevel.Vital);
      expect(template.tags).toEqual(['work', 'urgent']);
      expect(template.color).toBe('#FF0000');
      expect(template.icon).toBe('bell');
    });

    it('should emit a reminder:template-created domain event', () => {
      const template = createDefaultTemplate();
      const events = template.pullDomainEvents();

      expect(events.length).toBeGreaterThanOrEqual(1);
      const createdEvent = events.find((e) => e.eventType === 'reminder:template-created');
      expect(createdEvent).toBeDefined();
      expect((createdEvent!.payload as any).templateId).toBe(template.id);
      expect((createdEvent!.payload as any).reminder?.name).toBe('Daily Standup');
    });

    it('should default smartFrequencyEnabled to true', () => {
      const template = createDefaultTemplate();
      expect(template.smartFrequencyEnabled).toBe(true);
    });

    it('should default importanceLevel to Moderate', () => {
      const template = createDefaultTemplate();
      expect(template.importanceLevel).toBe(ImportanceLevel.Moderate);
    });
  });

  // -----------------------------------------------------------------------
  // Factory: load()
  // -----------------------------------------------------------------------
  describe('load()', () => {
    it('should reconstruct a template from state', () => {
      const state = makeState({ title: 'Loaded', version: 5 });
      const template = ReminderTemplate.load(state);

      expect(template.title).toBe('Loaded');
      expect(template.version).toBe(5);
      expect(template.id).toBe(state.id);
    });

    it('should not emit any domain events on load', () => {
      const template = ReminderTemplate.load(makeState());
      const events = template.pullDomainEvents();
      expect(events).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // enable() / pause() / toggle()
  // -----------------------------------------------------------------------
  describe('enable()', () => {
    it('should set selfEnabled to true and status to Active', () => {
      const template = ReminderTemplate.load(
        makeState({ selfEnabled: false, status: ReminderStatus.Paused }),
      );

      template.enable();

      expect(template.selfEnabled).toBe(true);
      expect(template.status).toBe(ReminderStatus.Active);
      expect(template.effectiveEnabled).toBe(true);
    });

    it('should emit a reminder:template-enabled event', () => {
      const template = ReminderTemplate.load(
        makeState({ selfEnabled: false, status: ReminderStatus.Paused }),
      );
      template.enable();
      const events = template.pullDomainEvents();

      const enabledEvent = events.find((e) => e.eventType === 'reminder:template-enabled');
      expect(enabledEvent).toBeDefined();
    });
  });

  describe('pause()', () => {
    it('should set selfEnabled to false and status to Paused', () => {
      const template = ReminderTemplate.load(makeState());

      template.pause();

      expect(template.selfEnabled).toBe(false);
      expect(template.status).toBe(ReminderStatus.Paused);
      expect(template.effectiveEnabled).toBe(false);
    });

    it('should emit a reminder:template-paused event', () => {
      const template = ReminderTemplate.load(makeState());
      template.pause();
      const events = template.pullDomainEvents();

      const pausedEvent = events.find((e) => e.eventType === 'reminder:template-paused');
      expect(pausedEvent).toBeDefined();
    });
  });

  describe('toggle()', () => {
    it('should pause an active template', () => {
      const template = ReminderTemplate.load(makeState({ selfEnabled: true }));
      template.toggle();
      expect(template.selfEnabled).toBe(false);
      expect(template.status).toBe(ReminderStatus.Paused);
    });

    it('should enable a paused template', () => {
      const template = ReminderTemplate.load(
        makeState({ selfEnabled: false, status: ReminderStatus.Paused }),
      );
      template.toggle();
      expect(template.selfEnabled).toBe(true);
      expect(template.status).toBe(ReminderStatus.Active);
    });
  });

  // -----------------------------------------------------------------------
  // update()
  // -----------------------------------------------------------------------
  describe('update()', () => {
    it('should update basic fields', () => {
      const template = ReminderTemplate.load(makeState());

      template.update({
        title: 'New Title',
        description: 'New Desc',
        importanceLevel: ImportanceLevel.Vital,
        tags: ['updated'],
        color: '#00FF00',
        icon: 'star',
      });

      expect(template.title).toBe('New Title');
      expect(template.description).toBe('New Desc');
      expect(template.importanceLevel).toBe(ImportanceLevel.Vital);
      expect(template.tags).toEqual(['updated']);
      expect(template.color).toBe('#00FF00');
      expect(template.icon).toBe('star');
    });

    it('should update trigger value object', () => {
      const template = ReminderTemplate.load(makeState());

      template.update({
        trigger: { type: 'Interval', fixedTime: null, interval: { minutes: 60, startTime: null } },
      });

      expect(template.trigger.type).toBe('Interval');
    });

    it('should emit a reminder:template-updated event', () => {
      const template = ReminderTemplate.load(makeState());
      template.update({ title: 'Changed' });

      const events = template.pullDomainEvents();
      const updatedEvent = events.find((e) => e.eventType === 'reminder:template-updated');
      expect(updatedEvent).toBeDefined();
    });

    it('should update updatedAt timestamp', () => {
      const state = makeState();
      const originalUpdatedAt = Number(state.updatedAt);
      const template = ReminderTemplate.load(state);

      template.update({ title: 'Timestamp check' });

      expect(Number(template.updatedAt)).toBeGreaterThanOrEqual(originalUpdatedAt);
    });

  });

  // -----------------------------------------------------------------------
  // softDelete() / restore()
  // -----------------------------------------------------------------------
  describe('softDelete()', () => {
    it('should set deletedAt', () => {
      const template = ReminderTemplate.load(makeState());
      template.softDelete();
      expect(template.deletedAt).not.toBeNull();
    });

    it('should emit a reminder:template-deleted event', () => {
      const template = ReminderTemplate.load(makeState());
      template.softDelete();
      const events = template.pullDomainEvents();
      const deletedEvent = events.find((e) => e.eventType === 'reminder:template-deleted');
      expect(deletedEvent).toBeDefined();
    });
  });

  describe('restore()', () => {
    it('should clear deletedAt', () => {
      const template = ReminderTemplate.load(makeState({ deletedAt: Date.now() }));
      template.restore();
      expect(template.deletedAt).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // external eligibility context
  // -----------------------------------------------------------------------
  describe('markEligibilityContextChanged()', () => {
    it('emits a scheduling re-read event without restoring single-group ownership', () => {
      const template = ReminderTemplate.load(makeState());
      template.markEligibilityContextChanged('profile-membership');

      const events = template.pullDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0]?.eventType).toBe('reminder:template-eligibility-changed');
      expect(events[0]?.payload).toMatchObject({
        identityId: template.identityId,
        templateId: template.id,
        cause: 'profile-membership',
      });
    });
  });

  // -----------------------------------------------------------------------
  // setEffectiveEnabled() / isEffectivelyEnabled()
  // -----------------------------------------------------------------------
  describe('setEffectiveEnabled()', () => {
    it('should update effectiveEnabled', () => {
      const template = ReminderTemplate.load(makeState({ effectiveEnabled: true }));
      template.setEffectiveEnabled(false);
      expect(template.effectiveEnabled).toBe(false);
      expect(template.isEffectivelyEnabled()).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Tag management
  // -----------------------------------------------------------------------
  describe('addTag() / removeTag()', () => {
    it('should add a tag', () => {
      const template = ReminderTemplate.load(makeState({ tags: [] }));
      template.addTag('health');
      expect(template.tags).toContain('health');
    });

    it('should not add duplicate tag', () => {
      const template = ReminderTemplate.load(makeState({ tags: ['health'] }));
      template.addTag('health');
      expect(template.tags).toEqual(['health']);
    });

    it('should remove an existing tag', () => {
      const template = ReminderTemplate.load(makeState({ tags: ['health', 'work'] }));
      template.removeTag('health');
      expect(template.tags).toEqual(['work']);
    });

    it('should do nothing when removing a non-existent tag', () => {
      const template = ReminderTemplate.load(makeState({ tags: ['health'] }));
      template.removeTag('missing');
      expect(template.tags).toEqual(['health']);
    });
  });

  // -----------------------------------------------------------------------
  // History management
  // -----------------------------------------------------------------------
  describe('createHistory()', () => {
    it('should create a history entry and add it to the aggregate', () => {
      const template = ReminderTemplate.load(makeState());
      const history = template.createHistory({
        triggeredAt: Date.now(),
        result: TriggerResult.Success,
      });

      expect(history).toBeDefined();
      expect(history.result).toBe(TriggerResult.Success);
      expect(template.getAllHistory()).toHaveLength(1);
    });

    it('should create a failed history entry with error', () => {
      const template = ReminderTemplate.load(makeState());
      const history = template.createHistory({
        triggeredAt: Date.now(),
        result: TriggerResult.Failed,
        error: 'Network timeout',
      });

      expect(history.result).toBe(TriggerResult.Failed);
      expect(history.error).toBe('Network timeout');
    });
  });

  describe('getRecentHistory()', () => {
    it('should return the most recent N history entries', () => {
      const template = ReminderTemplate.load(makeState());
      template.createHistory({ triggeredAt: 1000, result: TriggerResult.Success });
      template.createHistory({ triggeredAt: 2000, result: TriggerResult.Success });
      template.createHistory({ triggeredAt: 3000, result: TriggerResult.Failed });

      const recent = template.getRecentHistory(2);
      expect(recent).toHaveLength(2);
    });
  });

  // -----------------------------------------------------------------------
  // recordTrigger()
  // -----------------------------------------------------------------------
  describe('recordTrigger()', () => {
    it('should create a success history and emit triggered event', () => {
      const template = ReminderTemplate.load(makeState());
      template.recordTrigger();

      expect(template.getAllHistory()).toHaveLength(1);
      const events = template.pullDomainEvents();
      const triggeredEvent = events.find((e) => e.eventType === 'reminder:triggered');
      expect(triggeredEvent).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // Query methods
  // -----------------------------------------------------------------------
  describe('query methods', () => {
    it('isActive / isPaused', () => {
      const active = ReminderTemplate.load(makeState({ status: ReminderStatus.Active }));
      expect(active.isActive()).toBe(true);
      expect(active.isPaused()).toBe(false);

      const paused = ReminderTemplate.load(makeState({ status: ReminderStatus.Paused }));
      expect(paused.isActive()).toBe(false);
      expect(paused.isPaused()).toBe(true);
    });

    it('isOneTime / isRecurring', () => {
      const oneTime = ReminderTemplate.load(makeState({ type: ReminderType.OneTime }));
      expect(oneTime.isOneTime()).toBe(true);
      expect(oneTime.isRecurring()).toBe(false);

      const recurring = ReminderTemplate.load(makeState({ type: ReminderType.Recurring }));
      expect(recurring.isOneTime()).toBe(false);
      expect(recurring.isRecurring()).toBe(true);
    });

    it('shouldTriggerNow returns true when time has passed', () => {
      const template = ReminderTemplate.load(makeState({ nextTriggerAt: Date.now() - 1000 }));
      expect(template.shouldTriggerNow()).toBe(true);
    });

    it('shouldTriggerNow returns false when trigger is in the future', () => {
      const template = ReminderTemplate.load(makeState({ nextTriggerAt: Date.now() + 100_000 }));
      expect(template.shouldTriggerNow()).toBe(false);
    });

    it('shouldTriggerNow returns false when nextTriggerAt is null', () => {
      const template = ReminderTemplate.load(makeState({ nextTriggerAt: null }));
      expect(template.shouldTriggerNow()).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // isActiveAtTime()
  // -----------------------------------------------------------------------
  describe('isActiveAtTime()', () => {
    it('should return true for an active template at a valid time', () => {
      const now = Date.now();
      const template = ReminderTemplate.load(
        makeState({
          status: ReminderStatus.Active,
          activeTime: ActiveTimeConfig.createAt(now - 10_000),
          activeHours: null,
        }),
      );
      expect(template.isActiveAtTime(now)).toBe(true);
    });

    it('should return false for a paused template', () => {
      const now = Date.now();
      const template = ReminderTemplate.load(
        makeState({
          status: ReminderStatus.Paused,
          activeTime: ActiveTimeConfig.createAt(now - 10_000),
        }),
      );
      expect(template.isActiveAtTime(now)).toBe(false);
    });

    it('should return false before activatedAt', () => {
      const now = Date.now();
      const template = ReminderTemplate.load(
        makeState({
          status: ReminderStatus.Active,
          activeTime: ActiveTimeConfig.createAt(now + 100_000),
        }),
      );
      expect(template.isActiveAtTime(now)).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Smart frequency methods
  // -----------------------------------------------------------------------
  describe('smart frequency', () => {
    it('toggleSmartFrequency should change the flag', () => {
      const template = ReminderTemplate.load(makeState({ smartFrequencyEnabled: true }));
      template.toggleSmartFrequency(false);
      expect(template.smartFrequencyEnabled).toBe(false);

      template.toggleSmartFrequency(true);
      expect(template.smartFrequencyEnabled).toBe(true);
    });

    it('updateResponseMetrics should set metrics', () => {
      const template = ReminderTemplate.load(makeState());
      template.updateResponseMetrics({
        clickRate: 75,
        ignoreRate: 10,
        avgResponseTime: 5,
        snoozeCount: 2,
        effectivenessScore: 80,
        sampleSize: 100,
        lastAnalysisTime: Date.now(),
      });
      expect(template.responseMetrics).not.toBeNull();
      expect(template.responseMetrics!.clickRate).toBe(75);
    });

    it('needsFrequencyAdjustment returns false when no metrics', () => {
      const template = ReminderTemplate.load(
        makeState({ responseMetrics: null, smartFrequencyEnabled: true }),
      );
      expect(template.needsFrequencyAdjustment()).toBe(false);
    });

    it('needsFrequencyAdjustment returns false when smart frequency is disabled', () => {
      const template = ReminderTemplate.load(
        makeState({
          smartFrequencyEnabled: false,
          responseMetrics: ResponseMetrics.create({
            clickRate: 10,
            ignoreRate: 80,
            avgResponseTime: 5,
            snoozeCount: 0,
            effectivenessScore: 20,
            sampleSize: 50,
            lastAnalysisTime: Date.now(),
          }),
        }),
      );
      expect(template.needsFrequencyAdjustment()).toBe(false);
    });

    it('needsFrequencyAdjustment returns true for low effectiveness', () => {
      const template = ReminderTemplate.load(
        makeState({
          smartFrequencyEnabled: true,
          responseMetrics: ResponseMetrics.create({
            clickRate: 10,
            ignoreRate: 70,
            avgResponseTime: 5,
            snoozeCount: 0,
            effectivenessScore: 30,
            sampleSize: 50,
            lastAnalysisTime: Date.now(),
          }),
        }),
      );
      expect(template.needsFrequencyAdjustment()).toBe(true);
    });

    it('calculateSuggestedAdjustment returns null when not needed', () => {
      const template = ReminderTemplate.load(
        makeState({
          smartFrequencyEnabled: true,
          responseMetrics: ResponseMetrics.create({
            clickRate: 80,
            ignoreRate: 10,
            avgResponseTime: 5,
            snoozeCount: 0,
            effectivenessScore: 50,
            sampleSize: 50,
            lastAnalysisTime: Date.now(),
          }),
        }),
      );
      expect(template.calculateSuggestedAdjustment()).toBeNull();
    });

    it('applyFrequencyAdjustment should set adjustment', () => {
      const template = ReminderTemplate.load(makeState());
      template.applyFrequencyAdjustment({
        originalInterval: 3600,
        adjustedInterval: 7200,
        adjustmentReason: 'test',
        adjustmentTime: Date.now(),
        isAutoAdjusted: true,
        userConfirmed: false,
        rejectionReason: null,
      });
      expect(template.frequencyAdjustment).not.toBeNull();
    });

    it('confirmFrequencyAdjustment should mark as confirmed', () => {
      const template = ReminderTemplate.load(
        makeState({
          frequencyAdjustment: FrequencyAdjustment.createAuto(3600, 7200, 'test'),
        }),
      );
      template.confirmFrequencyAdjustment();
      expect(template.frequencyAdjustment!.userConfirmed).toBe(true);
    });

    it('confirmFrequencyAdjustment should throw if no adjustment', () => {
      const template = ReminderTemplate.load(makeState({ frequencyAdjustment: null }));
      expect(() => template.confirmFrequencyAdjustment()).toThrow(
        'No frequency adjustment to confirm',
      );
    });

    it('rejectFrequencyAdjustment should set rejection reason', () => {
      const template = ReminderTemplate.load(
        makeState({
          frequencyAdjustment: FrequencyAdjustment.createAuto(3600, 7200, 'test'),
        }),
      );
      template.rejectFrequencyAdjustment('Too aggressive');
      expect(template.frequencyAdjustment!.rejectionReason).toBe('Too aggressive');
    });

    it('rejectFrequencyAdjustment should throw if no adjustment', () => {
      const template = ReminderTemplate.load(makeState({ frequencyAdjustment: null }));
      expect(() => template.rejectFrequencyAdjustment()).toThrow(
        'No frequency adjustment to reject',
      );
    });
  });

  // -----------------------------------------------------------------------
  // toServerDTO() / toClientDTO()
  // -----------------------------------------------------------------------
  describe('toServerDTO()', () => {
    it('should return a complete server DTO', () => {
      const template = ReminderTemplate.load(makeState({ title: 'DTO Test' }));
      const dto = template.toServerDTO();

      expect(dto.name).toBe('DTO Test');
      expect(dto.id).toBe(template.id);
      expect(dto.trigger).toBeDefined();
      expect(dto.activeTime).toBeDefined();
      expect(dto.notificationConfig).toBeDefined();
    });
  });

  describe('toClientDTO()', () => {
    it('should return a client DTO with data fields', () => {
      const template = ReminderTemplate.load(makeState({ title: 'Client DTO' }));
      const dto = template.toClientDTO();

      expect(dto.name).toBe('Client DTO');
      expect(dto.type).toBeDefined();
      expect(dto.status).toBeDefined();
      expect(dto.importanceLevel).toBeDefined();
    });
  });
});
