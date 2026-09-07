import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { IdentityId } from '@memoflow/domain-shared';
import { ImportanceLevel } from '@memoflow/contracts/shared';
import { ReminderType } from '@memoflow/contracts/reminder';
import { ReminderTemplate } from '../../../domain/aggregates/reminder-template';
import { ReminderTemplatePrismaRepository } from './reminder-template-prisma.repository';
import {
  cleanAll,
  disconnectPrisma,
  getPrisma,
  seedAccount,
} from '../../../../__tests__/integration-helpers';

function createReminderTemplate(identityId: string) {
  const template = ReminderTemplate.create({
    identityId: identityId as IdentityId,
    title: 'Stretch and reset',
    type: ReminderType.Recurring,
    trigger: {
      type: 'FixedTime',
      fixedTime: { time: '09:30', timezone: null },
      interval: null,
    },
    activeTime: { activatedAt: Date.now() - 60_000 },
    notificationConfig: {
      channels: ['InApp'],
      title: 'Stretch break',
      body: 'Take five minutes away from the screen.',
      sound: { enabled: true, soundName: null },
      vibration: { enabled: true, pattern: null },
      actions: null,
    },
    description: 'Keep the workday sustainable.',
    importanceLevel: ImportanceLevel.Important,
    tags: ['health', 'focus'],
    color: '#14b8a6',
    icon: 'sparkles',
  });

  template.updateResponseMetrics({
    clickRate: 78,
    ignoreRate: 12,
    avgResponseTime: 6,
    snoozeCount: 1,
    effectivenessScore: 84,
    sampleSize: 25,
    lastAnalysisTime: Date.now(),
  });
  template.applyFrequencyAdjustment({
    originalInterval: 3600,
    adjustedInterval: 5400,
    adjustmentReason: 'Lower interruption during focus blocks',
    adjustmentTime: Date.now(),
    isAutoAdjusted: true,
    userConfirmed: false,
    rejectionReason: null,
  });
  template.recordTrigger();

  return template;
}

describe('ReminderTemplatePrismaRepository integration', () => {
  afterAll(async () => {
    await cleanAll();
    await disconnectPrisma();
  });

  beforeEach(async () => {
    await cleanAll();
  });

  it('persists and reloads history children, smart-frequency fields, and nullables without a single Profile owner column', async () => {
    const identityId = IdentityId.generate();
    await seedAccount({ id: identityId });

    const prisma = await getPrisma();
    const repository = new ReminderTemplatePrismaRepository(prisma);
    const template = createReminderTemplate(identityId);
    await repository.save(template);

    const row = await prisma.reminderTemplate.findUnique({
      where: { id: String(template.id) },
      include: { history: true },
    });
    const loaded = await repository.findByIdForIdentity(String(identityId), String(template.id), {
      includeHistory: true,
    });

    expect(row).not.toBeNull();
    expect(row).not.toHaveProperty('reminderGroupId');
    expect(row?.activeHours).toBeNull();
    expect(row?.history).toHaveLength(1);
    expect(row?.trigger).toContain('FixedTime');
    expect(row?.notificationConfig).toContain('Stretch break');

    expect(loaded).not.toBeNull();
    expect(loaded?.type).toBe(ReminderType.Recurring);
    expect(loaded?.history).toHaveLength(1);
    expect(loaded?.responseMetrics?.clickRate).toBe(78);
    expect(loaded?.frequencyAdjustment?.adjustedInterval).toBe(5400);
    expect(loaded?.description).toBe('Keep the workday sustainable.');
  });

  it('lists templates by identity without leaking foreign reminders', async () => {
    const identityId = IdentityId.generate();
    const otherIdentityId = IdentityId.generate();
    await seedAccount({ id: identityId });
    await seedAccount({ id: otherIdentityId });

    const prisma = await getPrisma();
    const repository = new ReminderTemplatePrismaRepository(prisma);
    await repository.save(createReminderTemplate(identityId));
    await repository.save(createReminderTemplate(identityId));
    await repository.save(createReminderTemplate(otherIdentityId));

    const templates = await repository.findByIdentityId(identityId);

    expect(templates).toHaveLength(2);
    expect(templates.every((template) => template.identityId === identityId)).toBe(true);
  });
});
