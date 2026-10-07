import { afterAll, beforeEach, expect, it } from 'vitest';
import { IdentityId } from '@memoflow/domain-shared';
import { createTimeContext } from '@memoflow/time';
import { createTaskPrismaReadQueries } from './task-page-reader';
import { TaskPlan } from '../../../domain/aggregates/task-plan';
import { TaskOccurrence } from '../../../domain/aggregates/task-occurrence';
import { TaskOccurrenceScheduleSnapshot } from '../../../domain/value-objects/task-occurrence-schedule-snapshot';
import { TaskPlanPrismaRepository } from './task-plan-prisma.repository';
import { TaskOccurrencePrismaRepository } from './task-occurrence-prisma.repository';
import { anAllDayTiming, canonicalTaskPlanScheduleForTest } from '../../../../testing';
import {
  cleanAll,
  getPrisma,
  seedAccount,
  disconnectPrisma,
} from '../../../../__tests__/integration-helpers';
import { TaskPlanScheduleKind } from '@memoflow/contracts/task';
import type { Ymd } from '@memoflow/contracts/primitives';

beforeEach(cleanAll);
afterAll(async () => {
  await cleanAll();
  await disconnectPrisma();
});
it('bounds owner pages, distinguishes IDs, preserves DST projections and never materializes upcoming facts', async () => {
  const db = await getPrisma();
  const a = IdentityId.generate(),
    b = IdentityId.generate();
  await seedAccount({ id: a });
  await seedAccount({ id: b });
  const time = createTimeContext({ timeZone: 'America/New_York', weekStartsOn: 1 });
  const planRepo = new TaskPlanPrismaRepository(db),
    occurrenceRepo = new TaskOccurrencePrismaRepository(db);
  const plans = [];
  for (const identityId of [a, a, a, b]) {
    const p = TaskPlan.create({
      identityId,
      title: 'Read fixture',
      schedule: canonicalTaskPlanScheduleForTest(
        TaskPlanScheduleKind.OneTime,
        Date.parse('2026-11-01T12:00:00Z'),
        anAllDayTiming(),
        null,
        time,
      ),
    });
    await planRepo.save(p);
    plans.push(p);
  }
  await db.taskPlan.updateMany({
    where: { identityId: String(a) },
    data: { createdAt: new Date('2026-10-01T00:00:00Z') },
  });
  for (const [index, date] of ['2026-10-31', '2026-11-01', '2026-11-01', '2026-11-02'].entries()) {
    const plan = plans[index];
    const o = TaskOccurrence.create({
      planId: plan.id,
      identityId: date === '2026-11-02' ? b : a,
      scheduleSnapshot: TaskOccurrenceScheduleSnapshot.create({
        date: date as Ymd,
        timing: anAllDayTiming(),
      }),
      importanceSnapshot: plan.importance,
    });
    // Same date on different plans avoids the canonical unique occurrence key.
    if (
      date === '2026-11-01' &&
      (await db.taskOccurrence.count({ where: { planId: String(plan.id), scheduleDate: date } }))
    )
      continue;
    await occurrenceRepo.save(o);
  }
  const queries = createTaskPrismaReadQueries(db, { getUserTimeContext: async () => time });
  const first = await queries.searchTaskPlans(String(a), { limit: 2 });
  expect(first.ok).toBe(true);
  if (!first.ok) throw Error('read');
  expect(first.data.items).toHaveLength(2);
  expect(first.data.hasMore).toBe(true);
  const last = first.data.items[1];
  const second = await queries.searchTaskPlans(String(a), {
    limit: 2,
    after: { createdAt: last.createdAt, id: last.id },
  });
  expect(second.ok && second.data.items).toHaveLength(1);
  expect(await queries.getTaskPlan(String(a), String(plans[3].id))).toMatchObject({
    ok: true,
    data: null,
  });
  expect(() =>
    queries.getTaskPlan(String(a), 'ITaskOccurrenceId_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ).toThrow();
  const literal = await queries.searchTaskPlans(String(a), { query: '%' });
  expect(literal.ok && literal.data.items).toEqual([]);
  const foreignOccurrence = await db.taskOccurrence.findFirstOrThrow({
    where: { identityId: String(b) },
  });
  expect(await queries.getTaskOccurrence(String(a), foreignOccurrence.id)).toMatchObject({
    ok: true,
    data: null,
  });
  const count = await db.taskOccurrence.count();
  const range = {
    startDate: Date.parse('2026-11-01T04:00:00Z'),
    endDate: Date.parse('2026-11-02T04:59:59Z'),
    limit: 1,
    includeOverdueOpen: true,
    asOf: Date.parse('2026-11-03T12:00:00Z'),
  };
  const page = await queries.listTaskOccurrences(String(a), range);
  expect(page.ok).toBe(true);
  if (!page.ok) throw Error('read');
  expect(page.data.items[0].scheduleSnapshot.date).toBe('2026-10-31');
  expect(page.data.items[0].isOverdue).toBe(true);
  expect(page.data.hasMore).toBe(true);
  const changedTime = createTaskPrismaReadQueries(db, {
    getUserTimeContext: async () => createTimeContext({ timeZone: 'Asia/Tokyo', weekStartsOn: 1 }),
  });
  expect(
    await changedTime.listTaskOccurrences(String(a), { ...range, timeZone: page.data.timeZone }),
  ).toMatchObject({ ok: false, error: { code: 'INVALID_CURSOR' } });
  const next = await queries.listTaskOccurrences(String(a), {
    ...range,
    timeZone: page.data.timeZone,
    after: { scheduleDate: page.data.items[0].scheduleSnapshot.date, id: page.data.items[0].id },
  });
  expect(next.ok && next.data.items[0].dueAt).toBe(Date.parse('2026-11-02T04:59:59.999Z'));
  const future = await queries.listTaskOccurrences(String(a), {
    startDate: Date.parse('2027-01-01T12:00:00Z'),
    endDate: Date.parse('2027-01-02T12:00:00Z'),
  });
  expect(future.ok && future.data.items).toEqual([]);
  expect(await db.taskOccurrence.count()).toBe(count);
  expect(() =>
    queries.listTaskOccurrences(String(a), { ...range, endDate: range.startDate + 32 * 86400000 }),
  ).toThrow();
  await db.taskPlan.update({
    where: { id: String(plans[0].id) },
    data: { name: 'x'.repeat(5000) },
  });
  expect(await queries.getTaskPlan(String(a), String(plans[0].id))).toMatchObject({
    ok: false,
    error: { code: 'RESPONSE_TOO_LARGE' },
  });
});

it('cancels a blocked Task read inside PostgreSQL and releases the connection', async () => {
  const db = await getPrisma();
  let unlock!: () => void, locked!: () => void;
  const ready = new Promise<void>((resolve) => {
      locked = resolve;
    }),
    release = new Promise<void>((resolve) => {
      unlock = resolve;
    });
  const holder = db.$transaction(
    async (tx) => {
      await tx.$executeRaw`LOCK TABLE task_plans IN ACCESS EXCLUSIVE MODE`;
      locked();
      await release;
    },
    { timeout: 5000 },
  );
  await ready;
  try {
    const query = createTaskPrismaReadQueries(db, {
      getUserTimeContext: async () => createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 }),
    });
    expect(
      await query.searchTaskPlans(
        'deadline-owner',
        { limit: 1 },
        { deadlineAt: Date.now() + 150, signal: new AbortController().signal },
      ),
    ).toMatchObject({ ok: false, error: { code: 'TIMEOUT' } });
    const [active] = await db.$queryRaw<
      { count: bigint }[]
    >`SELECT count(*) FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND state='active' AND wait_event_type='Lock' AND query LIKE '%task_plans%'`;
    expect(Number(active.count)).toBe(0);
  } finally {
    unlock();
    await holder;
  }
});
