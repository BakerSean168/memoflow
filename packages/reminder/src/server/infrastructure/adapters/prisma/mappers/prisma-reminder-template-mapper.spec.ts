/**
 * PrismaReminderTemplateMapper Unit Tests
 *
 * Covers:
 * - toDomain: Prisma row to domain aggregate with nested JSON parsing
 * - toPersistence: Aggregate to Prisma write data with JSON serialization
 * - Smart Frequency fields (responseMetrics, frequencyAdjustment)
 * - Optional history child entities
 * - Nested config objects (trigger, activeTime, notificationConfig, activeHours)
 * - Edge cases (null optional fields, missing smart frequency data)
 */

import { describe, it, expect } from 'vitest';
import { PrismaReminderTemplateMapper } from './prisma-reminder-template-mapper';
import type {
  ReminderHistory as PrismaReminderHistory,
  ReminderTemplate as PrismaReminderTemplate,
} from '@memoflow/database';
import {
  NotificationChannel,
  ReminderType,
  ReminderStatus,
  TriggerResult,
  TriggerType,
} from '@memoflow/contracts/reminder';
import { ImportanceLevel } from '@memoflow/contracts/shared';

// ─── Test Helpers ───────────────────────────────────────────────────

const TEST_IDENTITY_1 = 'IdentityId_550e8400-e29b-41d4-a716-446655440001';
const TEST_IDENTITY_2 = 'IdentityId_550e8400-e29b-41d4-a716-446655440002';
const TEST_TEMPLATE_1 = 'IReminderTemplateId_550e8400-e29b-41d4-a716-446655440011';
const TEST_TEMPLATE_2 = 'IReminderTemplateId_550e8400-e29b-41d4-a716-446655440012';
const TEST_HISTORY_1 = 'IReminderHistoryId_550e8400-e29b-41d4-a716-446655440031';
const TEST_HISTORY_2 = 'IReminderHistoryId_550e8400-e29b-41d4-a716-446655440032';

function createMinimalRow(): PrismaReminderTemplate {
  const now = new Date();
  return {
    id: TEST_TEMPLATE_1,
    identityId: TEST_IDENTITY_1,
    name: 'Simple Reminder',
    description: null,
    type: ReminderType.EventBased,
    trigger: JSON.stringify({
      type: TriggerType.EventBased,
      eventType: 'task_due',
      offsetMinutes: 0,
    }),
    activeTime: JSON.stringify({
      startDate: now.toISOString(),
      endDate: null,
      timezone: 'UTC',
    }),
    activeHours: null,
    notificationConfig: JSON.stringify({
      channels: ['Push'],
      title: null,
      body: null,
      sound: { enabled: true, soundName: null },
      vibration: { enabled: true, pattern: null },
      actions: null,
    }),
    selfEnabled: true,
    status: ReminderStatus.Active,
    importanceLevel: ImportanceLevel.Moderate,
    tags: JSON.stringify([]),
    color: null,
    icon: null,
    nextTriggerAt: null,
    
    // Smart Frequency fields: not set
    clickRate: null,
    ignoreRate: null,
    avgResponseTime: null,
    snoozeCount: null,
    effectivenessScore: null,
    sampleSize: null,
    lastAnalysisTime: null,
    originalInterval: null,
    adjustedInterval: null,
    adjustmentReason: null,
    adjustmentTime: null,
    isAutoAdjusted: null,
    userConfirmed: null,
    smartFrequencyEnabled: true,

    version: 1,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  } as PrismaReminderTemplate;
}

function createFullRow(): PrismaReminderTemplate {
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  
  return {
    id: TEST_TEMPLATE_2,
    identityId: TEST_IDENTITY_2,
    name: 'Complex Reminder',
    description: 'A reminder with full configuration',
    type: ReminderType.TimeBased,
    trigger: JSON.stringify({
      type: TriggerType.TimeBased,
      hourOfDay: 9,
      minuteOfHour: 0,
      daysOfWeek: [1, 3, 5],
    }),
    activeTime: JSON.stringify({
      startDate: now.toISOString(),
      endDate: tomorrow.toISOString(),
      timezone: 'America/New_York',
    }),
    activeHours: JSON.stringify({
      startHour: 8,
      startMinute: 0,
      endHour: 18,
      endMinute: 0,
      timezone: 'America/New_York',
    }),
    notificationConfig: JSON.stringify({
      channels: ['Email', 'Sms', 'Push'],
      title: 'Reminder',
      body: 'Do not forget',
      sound: { enabled: true, soundName: 'default' },
      vibration: { enabled: true, pattern: [100, 100] },
      actions: [
        {
          id: 'dismiss',
          title: 'Dismiss',
          actionType: 'Dismiss',
          style: 'Default',
          requiresInput: false,
          destructive: false,
        },
      ],
    }),
    selfEnabled: true,
    status: ReminderStatus.Active,
    importanceLevel: ImportanceLevel.High,
    tags: JSON.stringify(['urgent', 'work']),
    color: '#FF5733',
    icon: 'bell',
    nextTriggerAt: tomorrow,
    
    // Smart Frequency: Response Metrics
    clickRate: 0.75,
    ignoreRate: 0.15,
    avgResponseTime: 300,
    snoozeCount: 5,
    effectivenessScore: 0.85,
    sampleSize: 20,
    lastAnalysisTime: new Date(now.getTime() - 60 * 1000),
    
    // Smart Frequency: Frequency Adjustment
    originalInterval: 86400000,
    adjustedInterval: 64800000,
    adjustmentReason: 'Low click rate detected',
    adjustmentTime: new Date(now.getTime() - 30 * 1000),
    isAutoAdjusted: true,
    userConfirmed: true,
    smartFrequencyEnabled: true,

    version: 3,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  } as PrismaReminderTemplate;
}

function createHistoryRow(
  overrides: Partial<PrismaReminderHistory> = {},
): PrismaReminderHistory {
  const now = new Date();
  return {
    id: TEST_HISTORY_1,
    templateId: TEST_TEMPLATE_2,
    identityId: TEST_IDENTITY_2,
    triggeredAt: now,
    result: TriggerResult.Success,
    error: null,
    notificationSent: true,
    notificationChannel: JSON.stringify([
      NotificationChannel.Push,
      NotificationChannel.Email,
    ]),
    createdAt: now,
    ...overrides,
  } as PrismaReminderHistory;
}

// ─── Tests ───────────────────────────────────────────────────────

describe('PrismaReminderTemplateMapper', () => {
  describe('toDomain', () => {
    it('maps minimal Prisma row to domain aggregate', () => {
      const row = createMinimalRow();
      const domain = PrismaReminderTemplateMapper.toDomain(row);

      expect(domain.id).toBe(TEST_TEMPLATE_1);
      expect(domain.identityId).toBe(TEST_IDENTITY_1);
      expect(domain.title).toBe('Simple Reminder');
      expect(domain.description).toBeNull();
      expect(domain.type).toBe(ReminderType.EventBased);
      expect(domain.selfEnabled).toBe(true);
      expect(domain.status).toBe(ReminderStatus.Active);
      expect(domain.importanceLevel).toBe(ImportanceLevel.Moderate);
      expect(domain.tags).toEqual([]);
      expect(domain.color).toBeNull();
      expect(domain.icon).toBeNull();
      expect(domain.version).toBe(1);
    });

    it('maps full Prisma row with all fields to domain', () => {
      const row = createFullRow();
      const domain = PrismaReminderTemplateMapper.toDomain(row);

      expect(domain.id).toBe(TEST_TEMPLATE_2);
      expect(domain.identityId).toBe(TEST_IDENTITY_2);
      expect(domain.title).toBe('Complex Reminder');
      expect(domain.description).toBe('A reminder with full configuration');
      expect(domain.type).toBe(ReminderType.TimeBased);
      expect(domain.selfEnabled).toBe(true);
      expect(domain.status).toBe(ReminderStatus.Active);
      expect(domain.importanceLevel).toBe(ImportanceLevel.High);
      expect(domain.tags).toEqual(['urgent', 'work']);
      expect(domain.color).toBe('#FF5733');
      expect(domain.icon).toBe('bell');
      expect(domain.version).toBe(3);
    });

    it('parses trigger config correctly', () => {
      const row = createFullRow();
      const domain = PrismaReminderTemplateMapper.toDomain(row);

      expect(domain.trigger).toBeDefined();
      expect(domain.trigger.type).toBe(TriggerType.TimeBased);
    });

    it('parses activeTime config correctly', () => {
      const row = createFullRow();
      const domain = PrismaReminderTemplateMapper.toDomain(row);

      // ActiveTimeConfig is parsed from JSON
      // The exact structure depends on the JSON in the row
      expect(domain.activeTime).toBeDefined();
    });

    it('parses activeHours when present', () => {
      const row = createFullRow();
      const domain = PrismaReminderTemplateMapper.toDomain(row);

      expect(domain.activeHours).toBeDefined();
      expect(domain.activeHours?.startHour).toBe(8);
      expect(domain.activeHours?.endHour).toBe(18);
    });

    it('handles null activeHours as null', () => {
      const row = createMinimalRow();
      const domain = PrismaReminderTemplateMapper.toDomain(row);

      expect(domain.activeHours).toBeNull();
    });

    it('parses notificationConfig correctly', () => {
      const row = createFullRow();
      const domain = PrismaReminderTemplateMapper.toDomain(row);

      expect(domain.notificationConfig).toBeDefined();
      expect(domain.notificationConfig.channels).toContain('Email');
      expect(domain.notificationConfig.channels).toContain('Sms');
      expect(domain.notificationConfig.channels).toContain('Push');
    });

    it('reconstructs response metrics from flat fields', () => {
      const row = createFullRow();
      const domain = PrismaReminderTemplateMapper.toDomain(row);

      expect(domain.responseMetrics).toBeDefined();
      expect(domain.responseMetrics?.clickRate).toBe(0.75);
      expect(domain.responseMetrics?.ignoreRate).toBe(0.15);
      expect(domain.responseMetrics?.avgResponseTime).toBe(300);
      expect(domain.responseMetrics?.snoozeCount).toBe(5);
    });

    it('handles missing response metrics as null', () => {
      const row = createMinimalRow();
      const domain = PrismaReminderTemplateMapper.toDomain(row);

      expect(domain.responseMetrics).toBeNull();
    });

    it('reconstructs frequency adjustment from flat fields', () => {
      const row = createFullRow();
      const domain = PrismaReminderTemplateMapper.toDomain(row);

      expect(domain.frequencyAdjustment).toBeDefined();
      expect(domain.frequencyAdjustment?.originalInterval).toBe(86400000);
      expect(domain.frequencyAdjustment?.adjustedInterval).toBe(64800000);
      expect(domain.frequencyAdjustment?.adjustmentReason).toBe('Low click rate detected');
      expect(domain.frequencyAdjustment?.isAutoAdjusted).toBe(true);
    });

    it('handles missing frequency adjustment as null', () => {
      const row = createMinimalRow();
      const domain = PrismaReminderTemplateMapper.toDomain(row);

      expect(domain.frequencyAdjustment).toBeNull();
    });

    it('preserves timestamps', () => {
      const row = createFullRow();
      const domain = PrismaReminderTemplateMapper.toDomain(row);

      expect(domain.createdAt).toBe(row.createdAt.getTime());
      expect(domain.updatedAt).toBe(row.updatedAt.getTime());
    });

    it('converts nextTriggerAt timestamp correctly', () => {
      const row = createFullRow();
      const domain = PrismaReminderTemplateMapper.toDomain(row);

      expect(domain.nextTriggerAt).toBe(row.nextTriggerAt?.getTime());
    });

    it('handles null nextTriggerAt', () => {
      const row = createMinimalRow();
      const domain = PrismaReminderTemplateMapper.toDomain(row);

      expect(domain.nextTriggerAt).toBeNull();
    });

    it('converts soft delete timestamp correctly', () => {
      const deletedDate = new Date();
      const row = { ...createMinimalRow(), deletedAt: deletedDate };
      const domain = PrismaReminderTemplateMapper.toDomain(row);

      expect(domain.deletedAt).toBe(deletedDate.getTime());
    });

    it('handles history child entities if provided', () => {
      const row = createFullRow();
      const historyRecords = [createHistoryRow()];
      const domain = PrismaReminderTemplateMapper.toDomain(row, historyRecords);

      expect(domain.history).toHaveLength(1);
      expect(domain.history?.[0]?.result).toBe(TriggerResult.Success);
      expect(domain.history?.[0]?.notificationChannels).toEqual([
        NotificationChannel.Push,
        NotificationChannel.Email,
      ]);
    });

    it('handles history row with null notification channels', () => {
      const row = createFullRow();
      const historyRecords = [
        createHistoryRow({
          id: TEST_HISTORY_2,
          notificationChannel: null,
          notificationSent: false,
        }),
      ];
      const domain = PrismaReminderTemplateMapper.toDomain(row, historyRecords);

      expect(domain.history).toHaveLength(1);
      expect(domain.history?.[0]?.notificationChannels).toBeNull();
      expect(domain.history?.[0]?.notificationSent).toBe(false);
    });
  });

  describe('toPersistence', () => {
    it('maps full aggregate to Prisma write data', () => {
      const domain = PrismaReminderTemplateMapper.toDomain(createFullRow());
      const persistence = PrismaReminderTemplateMapper.toPersistence(domain);

      expect(persistence.identityId).toBe(TEST_IDENTITY_2);
      expect(persistence.name).toBe('Complex Reminder');
      expect(persistence.description).toBe('A reminder with full configuration');
      expect(persistence.type).toBe(ReminderType.TimeBased);
      expect(persistence.status).toBe(ReminderStatus.Active);
      expect(persistence).not.toHaveProperty('reminderGroupId');
      expect(persistence.importanceLevel).toBe(ImportanceLevel.High);
      expect(JSON.parse(persistence.tags)).toEqual(['urgent', 'work']);
      expect(persistence.nextTriggerAt).toBeInstanceOf(Date);
      expect(persistence.activeHours).not.toBeNull();
      expect(persistence.stats).toBe('{}');

      // Smart frequency fields should be materialized from value objects.
      expect(persistence.clickRate).toBe(0.75);
      expect(persistence.ignoreRate).toBe(0.15);
      expect(persistence.originalInterval).toBe(86400000);
      expect(persistence.adjustedInterval).toBe(64800000);
      expect(persistence.adjustmentReason).toBe('Low click rate detected');
      expect(persistence.lastAnalysisTime).toBeInstanceOf(Date);
      expect(persistence.adjustmentTime).toBeInstanceOf(Date);
      expect(persistence.isAutoAdjusted).toBe(true);
      expect(persistence.userConfirmed).toBe(true);
    });

    it('maps minimal aggregate to Prisma write data with null-able fields', () => {
      const domain = PrismaReminderTemplateMapper.toDomain(createMinimalRow());
      const persistence = PrismaReminderTemplateMapper.toPersistence(domain);

      expect(persistence.identityId).toBe(TEST_IDENTITY_1);
      expect(persistence.activeHours).toBeNull();
      expect(persistence.nextTriggerAt).toBeNull();
      expect(persistence.clickRate).toBeNull();
      expect(persistence.ignoreRate).toBeNull();
      expect(persistence.originalInterval).toBeNull();
      expect(persistence.adjustedInterval).toBeNull();
      expect(persistence.adjustmentReason).toBeNull();
      expect(persistence.lastAnalysisTime).toBeNull();
      expect(persistence.adjustmentTime).toBeNull();
      expect(persistence.isAutoAdjusted).toBe(false);
      expect(persistence.userConfirmed).toBe(false);
      expect(persistence.deletedAt).toBeNull();
    });

    it('converts deletedAt timestamp back to Date', () => {
      const deletedAt = new Date();
      const domain = PrismaReminderTemplateMapper.toDomain({
        ...createMinimalRow(),
        deletedAt,
      });
      const persistence = PrismaReminderTemplateMapper.toPersistence(domain);

      expect(persistence.deletedAt).toBeInstanceOf(Date);
      expect(persistence.deletedAt?.getTime()).toBe(deletedAt.getTime());
    });
  });
});
