import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { IdentityId } from '@memoflow/domain-shared';
import { ReminderResponse } from '../../../domain/entities/reminder-response';
import { ReminderResponsePrismaRepository } from './reminder-response-prisma.repository';
import {
  cleanAll,
  disconnectPrisma,
  getPrisma,
  seedAccount,
} from '../../../../__tests__/integration-helpers';

async function seedTemplate(identityId: string, templateId: string): Promise<void> {
  const prisma = await getPrisma();
  await prisma.reminderTemplate.create({
    data: {
      id: templateId,
      identityId,
      name: 'Response semantics fixture',
      description: null,
      type: 'Recurring',
      selfEnabled: true,
      status: 'Active',
      importanceLevel: 'Important',
      tags: '[]',
      color: null,
      icon: null,
      trigger: JSON.stringify({ type: 'Interval', interval: { seconds: 3600 } }),
      recurrence: null,
      activeTime: JSON.stringify({ activatedAt: Date.now() - 60_000 }),
      activeHours: null,
      notificationConfig: JSON.stringify({ channels: ['InApp'] }),
      stats: '{}',
    },
  });
}

describe('ReminderResponsePrismaRepository integration', () => {
  afterAll(async () => {
    await cleanAll();
    await disconnectPrisma();
  });

  beforeEach(async () => {
    await cleanAll();
  });

  it('round-trips response latency and snooze duration as independent seconds', async () => {
    const identityId = String(IdentityId.generate());
    const templateId = 'IReminderTemplateId_550e8400-e29b-41d4-a716-446655440111';
    await seedAccount({ id: identityId });
    await seedTemplate(identityId, templateId);

    const prisma = await getPrisma();
    const repository = new ReminderResponsePrismaRepository(prisma);
    const response = ReminderResponse.create({
      reminderTemplateId: templateId,
      identityId,
      action: 'SNOOZED',
      responseTime: 7,
      snoozeDurationSeconds: 900,
      timestamp: Date.now(),
    });

    await repository.save(response);

    const persisted = await prisma.reminderResponse.findUnique({ where: { id: response.id } });
    const loaded = await repository.findByIdForIdentity(identityId, response.id);
    const stats = await repository.getResponseStats(templateId, identityId, 30);

    expect(persisted?.responseTime).toBe(7);
    expect(persisted?.snoozeDurationSeconds).toBe(900);
    expect(loaded?.responseTime).toBe(7);
    expect(loaded?.snoozeDurationSeconds).toBe(900);
    expect(stats.snoozed).toBe(1);
    expect(stats.avgResponseTime).toBe(7);
  });
});
