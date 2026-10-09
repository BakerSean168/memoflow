import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import {
  createPrismaProfileImportService,
  createProfileImportScheduleRecovery,
} from '@memoflow/data-portability';
import { createScheduleOrchestrationModule } from '@memoflow/schedule-orchestration';
import { createSchedulerPrismaRepositories } from '@memoflow/scheduler';
import { createGoalPrismaScheduleProjectionSource } from '@memoflow/goal/schedule-projection';
import { createTaskPrismaScheduleProjectionSource } from '@memoflow/task/schedule-projection';
import { createSettingPrismaPortability } from '@memoflow/setting';
import {
  cleanAll,
  disconnectPrisma,
  getPrisma,
  seedAccount,
} from '@memoflow/test-utils/setup/integration-helpers';
import { composeProfileImportCapabilities } from './compose-profile-import-capabilities';
import { composeBusinessDataSummary } from './compose-business-data-summary';
import { PrismaClient } from '@memoflow/database';
import { PrismaPg } from '@prisma/adapter-pg';

beforeAll(async () => {
  const db = await getPrisma();
  await db.$executeRawUnsafe('CREATE SCHEMA IF NOT EXISTS mastra');
  for (const table of ['mastra_threads', 'mastra_messages', 'mastra_workflow_snapshot']) {
    await db.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS mastra.${table} (id text PRIMARY KEY, "resourceId" text)`,
    );
  }
});
beforeEach(cleanAll);
afterAll(disconnectPrisma);

function request(requestId = 'request-recovery-1') {
  return {
    requestId,
    content: JSON.stringify({
      format: 'memoflow.user-data-export',
      schemaVersion: 3,
      productVersion: 'test',
      exportedAt: '2026-10-09T00:00:00Z',
      capabilities: [
        {
          key: 'labels',
          schemaVersion: 3,
          payload: { labels: [{ ref: 'labels:1', name: 'Copied label', color: null }] },
        },
        {
          key: 'goals',
          schemaVersion: 3,
          payload: {
            goals: [
              {
                ref: 'goals:1',
                name: 'Copied goal',
                summary: null,
                description: null,
                status: 'Planned',
                start: null,
                target: null,
                reminderConfig: null,
                archived: false,
                labelRefs: ['labels:1'],
                keyResults: [],
                records: [],
                reviews: [],
              },
            ],
          },
        },
      ],
    }),
  };
}

it('recovers a committed response by the original request key and rejects same-key different content or another principal', async () => {
  const db = await getPrisma();
  const account = await seedAccount();
  const other = await seedAccount();
  const service = createPrismaProfileImportService(db, {
    capabilities: composeProfileImportCapabilities,
    readSummary: (tx, identityId) => composeBusinessDataSummary(tx)(identityId),
  });
  const input = request();
  const plan = await service.preflight(account.id, input);
  const committed = await service.commit(account.id, {
    ...input,
    effectiveDigest: plan.effectiveDigest,
  });
  expect(committed.status).toBe('committed');
  expect(committed.serverVerified).toBe(true);
  expect(await service.get(account.id, input.requestId)).toEqual(committed);
  expect(
    await service.commit(account.id, { ...input, effectiveDigest: plan.effectiveDigest }),
  ).toEqual(committed);
  expect(await db.goal.count()).toBe(1);
  expect(await db.profileImportOperation.count()).toBe(1);
  await expect(service.get(other.id, input.requestId)).rejects.toThrow('IMPORT_NOT_FOUND');
  await expect(
    service.commit(account.id, {
      ...input,
      content: input.content.replace('Copied goal', 'Changed goal'),
      effectiveDigest: plan.effectiveDigest,
    }),
  ).rejects.toThrow('IMPORT_REQUEST_CONFLICT');
  await db.goal.updateMany({
    where: { identityId: account.id },
    data: { name: 'Edited after import' },
  });
  expect(await service.get(account.id, input.requestId)).toMatchObject({
    status: 'committed',
    serverVerified: false,
  });
});

it('rejects a plan when another device wrote first without partial import', async () => {
  const db = await getPrisma();
  const account = await seedAccount();
  const service = createPrismaProfileImportService(db, {
    capabilities: composeProfileImportCapabilities,
    readSummary: (tx, identityId) => composeBusinessDataSummary(tx)(identityId),
  });
  const input = request();
  const plan = await service.preflight(account.id, input);
  await db.label.create({
    data: {
      id: 'other-device-label',
      identityId: account.id,
      name: 'Other device',
      normalizedName: 'other device',
    },
  });
  await expect(
    service.commit(account.id, { ...input, effectiveDigest: plan.effectiveDigest }),
  ).rejects.toThrow('TARGET_NOT_EMPTY');
  expect(await db.goal.count()).toBe(0);
  expect(await db.label.count()).toBe(1);
  expect(await service.get(account.id, input.requestId)).toMatchObject({ status: 'pending' });
});

it('fences a raw second-connection write until import commits, including writers unaware of the import API', async () => {
  const db = await getPrisma();
  const second = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });
  const account = await seedAccount();
  let release = () => {};
  let entered = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const locked = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let hold = false;
  let writerPid = 0;
  const service = createPrismaProfileImportService(db, {
    capabilities: composeProfileImportCapabilities,
    readSummary: async (tx, identityId) => {
      if (hold) {
        entered();
        await gate;
      }
      return composeBusinessDataSummary(tx)(identityId);
    },
  });
  const input = request();
  const plan = await service.preflight(account.id, input);
  hold = true;
  const committing = service.commit(account.id, {
    ...input,
    effectiveDigest: plan.effectiveDigest,
  });
  let writing: Promise<unknown> | undefined;
  try {
    await locked;
    writing = second.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
        writerPid = rows[0]!.pid;
        return tx.label.create({
          data: {
            id: 'concurrent-label',
            identityId: account.id,
            name: 'After import',
            normalizedName: 'after import',
          },
        });
      },
      { timeout: 10_000 },
    );
    await expect
      .poll(
        async () => {
          if (!writerPid) return false;
          const rows = await db.$queryRaw<
            Array<{ blocked: boolean }>
          >`SELECT cardinality(pg_blocking_pids(${writerPid}::int)) > 0 AS blocked`;
          return rows[0]!.blocked;
        },
        { timeout: 2000 },
      )
      .toBe(true);
    release();
    expect(await committing).toMatchObject({ status: 'committed', serverVerified: true });
    await writing;
    expect(await db.label.count()).toBe(2);
    expect(await db.goal.count()).toBe(1);
  } finally {
    release();
    await Promise.allSettled([committing, writing]);
    await second.$disconnect();
  }
});

it('returns a single durable result to concurrent identical commit requests', async () => {
  const db = await getPrisma();
  const account = await seedAccount();
  const service = createPrismaProfileImportService(db, {
    capabilities: composeProfileImportCapabilities,
    readSummary: (tx, identityId) => composeBusinessDataSummary(tx)(identityId),
  });
  const input = request();
  const plan = await service.preflight(account.id, input);
  const results = await Promise.all([
    service.commit(account.id, { ...input, effectiveDigest: plan.effectiveDigest }),
    service.commit(account.id, { ...input, effectiveDigest: plan.effectiveDigest }),
  ]);
  expect(results[0]).toEqual(results[1]);
  expect(await db.profileImportOperation.count()).toBe(1);
  expect(await db.goal.count()).toBe(1);
});

it('persists future-schedule recovery with the import and retries after a worker restart', async () => {
  const db = await getPrisma();
  const account = await seedAccount();
  const service = createPrismaProfileImportService(db, {
    capabilities: composeProfileImportCapabilities,
    readSummary: (tx, identityId) => composeBusinessDataSummary(tx)(identityId),
  });
  const input = request('schedule-recovery-1');
  input.content = input.content.replace(
    '"reminderConfig":null',
    JSON.stringify({
      reminderConfig: {
        enabled: true,
        triggers: [{ type: 'AbsoluteAt', value: Date.now() + 86_400_000, enabled: true }],
      },
    }).slice(1, -1),
  );
  const plan = await service.preflight(account.id, input);
  await service.commit(account.id, { ...input, effectiveDigest: plan.effectiveDigest });
  expect((await db.profileImportOperation.findFirstOrThrow()).schedulingReconciledAt).toBeNull();
  await createProfileImportScheduleRecovery(db, async () => false).sweep();
  expect((await db.profileImportOperation.findFirstOrThrow()).schedulingReconciledAt).toBeNull();
  const time = createSettingPrismaPortability(db).userTimeContextPort;
  const module = createScheduleOrchestrationModule({
    scheduler: {
      invocationRepository: createSchedulerPrismaRepositories(db).scheduledInvocationRepository,
    },
    goalProjection: { source: createGoalPrismaScheduleProjectionSource(db, time) },
    taskProjection: { source: createTaskPrismaScheduleProjectionSource(db, time) },
    execution: {},
  });
  const restarted = createProfileImportScheduleRecovery(db, module.reconcileImportedProfile);
  await restarted.sweep();
  expect(
    (await db.profileImportOperation.findFirstOrThrow()).schedulingReconciledAt,
  ).not.toBeNull();
  expect(await db.scheduledInvocation.count({ where: { identityId: account.id } })).toBe(1);
  await restarted.sweep();
  expect(await db.scheduledInvocation.count({ where: { identityId: account.id } })).toBe(1);
  expect(await db.notification.count()).toBe(0);
});
