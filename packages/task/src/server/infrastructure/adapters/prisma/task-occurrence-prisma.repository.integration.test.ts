import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ImportanceLevel } from '@memoflow/contracts/shared';
import { TaskOccurrenceResultKind, TaskTimingKind } from '@memoflow/contracts/task';
import { IdentityId } from '@memoflow/domain-shared';
import { asYmd } from '@memoflow/time';
import { TaskOccurrence } from '../../../domain/aggregates/task-occurrence';
import { TaskPlanPrismaRepository } from './task-plan-prisma.repository';
import { TaskOccurrencePrismaRepository } from './task-occurrence-prisma.repository';
import {
  cleanTaskTables,
  disconnectPrisma,
  getPrisma,
  seedAccount,
} from '../../../../__tests__/integration-helpers';
import {
  aOneTimeTask,
  canonicalTaskOccurrenceScheduleForTest,
} from '../../../../testing';

function createOccurrence(params: {
  planId: Parameters<typeof TaskOccurrence.create>[0]['planId'];
  identityId: IdentityId;
  date: string;
  importance?: ImportanceLevel;
  checklistDefinition?: Array<{ id: string; title: string; order: number }>;
}) {
  return TaskOccurrence.create({
      planId: params.planId,
      identityId: params.identityId,
      scheduleSnapshot: canonicalTaskOccurrenceScheduleForTest(
        Date.parse(`${params.date}T00:00:00.000Z`),
        { kind: TaskTimingKind.AllDay },
    ),
    importanceSnapshot: params.importance ?? ImportanceLevel.Moderate,
    checklistDefinition: params.checklistDefinition ?? [],
  });
}

async function seedPlan(params: {
  identityId: IdentityId;
  title?: string;
  importance?: ImportanceLevel;
  date?: string;
}) {
  const prisma = await getPrisma();
  const repository = new TaskPlanPrismaRepository(prisma);
  const date = params.date ?? '2026-09-14';
  const plan = aOneTimeTask({
    identityId: params.identityId,
    title: params.title ?? 'Task occurrence integration',
    importance: params.importance ?? ImportanceLevel.Moderate,
    startDate: Date.parse(`${date}T00:00:00.000Z`),
  });
  await repository.save(plan);
  return { prisma, plan };
}

describe('TaskOccurrencePrismaRepository canonical integration', () => {
  afterAll(async () => {
    await disconnectPrisma();
  });

  beforeEach(async () => {
    await cleanTaskTables();
  });

  it('persists and loads canonical occurrence truth by identity + id', async () => {
    const identityId = IdentityId.generate();
    await seedAccount({ id: identityId });
    const { prisma, plan } = await seedPlan({ identityId });
    const repository = new TaskOccurrencePrismaRepository(prisma);
    const occurrence = createOccurrence({
      planId: plan.id,
      identityId,
      date: '2026-09-14',
      importance: ImportanceLevel.Important,
      checklistDefinition: [{ id: 'check-a', title: 'Prepare', order: 0 }],
    });

    await repository.save(occurrence);
    const saved = await repository.findByIdForIdentity(identityId, occurrence.id);

    expect(saved).not.toBeNull();
    expect(saved?.id).toBe(occurrence.id);
    expect(saved?.planId).toBe(plan.id);
    expect(saved?.scheduleDate).toBe('2026-09-14');
    expect(saved?.occurrenceKey).toBe(`${plan.id}:2026-09-14`);
    expect(saved?.importanceSnapshot).toBe(ImportanceLevel.Important);
    expect(saved?.checklistState[0]).toMatchObject({
      definitionId: 'check-a',
      titleSnapshot: 'Prepare',
      completed: false,
    });
  });

  it('lists occurrences by identity in descending schedule-date order', async () => {
    const identityId = IdentityId.generate();
    await seedAccount({ id: identityId });
    const { prisma, plan } = await seedPlan({ identityId });
    const repository = new TaskOccurrencePrismaRepository(prisma);
    const first = createOccurrence({ planId: plan.id, identityId, date: '2026-09-14' });
    const second = createOccurrence({ planId: plan.id, identityId, date: '2026-09-16' });

    await repository.saveMany([first, second]);
    const occurrences = await repository.findByIdentityId(identityId);

    expect(occurrences.map((item) => item.id)).toEqual([second.id, first.id]);
  });

  it('lists occurrences by Plan id without cross-owner leakage', async () => {
    const identityId = IdentityId.generate();
    await seedAccount({ id: identityId });
    const { prisma, plan } = await seedPlan({ identityId });
    const repository = new TaskOccurrencePrismaRepository(prisma);
    const first = createOccurrence({ planId: plan.id, identityId, date: '2026-09-14' });
    const second = createOccurrence({ planId: plan.id, identityId, date: '2026-09-15' });
    await repository.saveMany([first, second]);

    const occurrences = await repository.findByPlanId(plan.id, String(identityId));

    expect(occurrences).toHaveLength(2);
    expect(new Set(occurrences.map((item) => item.id))).toEqual(new Set([first.id, second.id]));
  });

  it('updates open execution state through optimistic concurrency', async () => {
    const identityId = IdentityId.generate();
    await seedAccount({ id: identityId });
    const { prisma, plan } = await seedPlan({ identityId });
    const repository = new TaskOccurrencePrismaRepository(prisma);
    const occurrence = createOccurrence({ planId: plan.id, identityId, date: '2026-09-14' });
    await repository.save(occurrence);

    occurrence.start(123_000);
    await repository.save(occurrence);
    const saved = await repository.findByIdForIdentity(identityId, occurrence.id);

    expect(saved?.status).toBe('InProgress');
    expect(saved?.actualStartAt).toBe(123_000);
    expect(saved?.version).toBe(2);
  });

  it('round-trips Completed Result instead of legacy comment/end-time columns', async () => {
    const identityId = IdentityId.generate();
    await seedAccount({ id: identityId });
    const { prisma, plan } = await seedPlan({ identityId });
    const repository = new TaskOccurrencePrismaRepository(prisma);
    const occurrence = createOccurrence({ planId: plan.id, identityId, date: '2026-09-14' });
    occurrence.start(60_000);
    occurrence.complete(undefined, 'done', 5, undefined, 181_000);

    await repository.save(occurrence);
    const saved = await repository.findByIdForIdentity(identityId, occurrence.id);

    expect(saved?.status).toBe('Completed');
    expect(saved?.result).toEqual({
      kind: TaskOccurrenceResultKind.Completed,
      recordedAt: 181_000,
      actualDurationMinutes: 2,
      note: 'done',
      rating: 5,
    });
  });

  it('deletes only the owned occurrence', async () => {
    const identityId = IdentityId.generate();
    await seedAccount({ id: identityId });
    const { prisma, plan } = await seedPlan({ identityId });
    const repository = new TaskOccurrencePrismaRepository(prisma);
    const occurrence = createOccurrence({ planId: plan.id, identityId, date: '2026-09-14' });
    await repository.save(occurrence);

    await repository.delete(String(identityId), occurrence.id);

    expect(await repository.findByIdForIdentity(identityId, occurrence.id)).toBeNull();
  });

  it('round-trips schedule snapshot, Result and checklist state losslessly', async () => {
    const identityId = IdentityId.generate();
    await seedAccount({ id: identityId });
    const { prisma, plan } = await seedPlan({ identityId });
    const repository = new TaskOccurrencePrismaRepository(prisma);
    const original = createOccurrence({
      planId: plan.id,
      identityId,
      date: '2026-09-14',
      importance: ImportanceLevel.Vital,
      checklistDefinition: [{ id: 'check-a', title: 'Prepare', order: 0 }],
    });
    original.completeChecklistItem('check-a', 100_000);
    original.complete(12, 'evidence', 4, undefined, 200_000);

    await repository.save(original);
    const loaded = await repository.findByIdForIdentity(String(identityId), original.id);

    expect(loaded?.toPersistenceState()).toEqual(original.toPersistenceState());
  });

  it('calculates completion stats from Ymd schedule windows', async () => {
    const identityId = IdentityId.generate();
    await seedAccount({ id: identityId });
    const { prisma, plan } = await seedPlan({ identityId, date: '2026-07-31' });
    const repository = new TaskOccurrencePrismaRepository(prisma);

    const outsideWindowCompleted = createOccurrence({
      planId: plan.id,
      identityId,
      date: '2026-06-29',
    });
    outsideWindowCompleted.complete();
    const dueCompleted = createOccurrence({ planId: plan.id, identityId, date: '2026-07-10' });
    dueCompleted.complete();
    const duePending = createOccurrence({ planId: plan.id, identityId, date: '2026-07-20' });
    const futurePending = createOccurrence({ planId: plan.id, identityId, date: '2026-07-31' });
    await repository.saveMany([outsideWindowCompleted, dueCompleted, duePending, futurePending]);

    const stats = (
      await repository.getPlanStats([plan.id], String(identityId), {
        windowStart: asYmd('2026-07-01'),
        asOf: asYmd('2026-07-30'),
      })
    )[plan.id];

    expect(stats).toEqual({
      planId: plan.id,
      occurrenceCount: 4,
      completedOccurrenceCount: 2,
      pendingOccurrenceCount: 2,
      dueOccurrenceCount: 2,
      completedDueOccurrenceCount: 1,
      completionWindowDays: 30,
      futurePendingOccurrenceCount: 1,
      singleOccurrenceStatus: null,
      completionRate: 50,
    });
  });
});
