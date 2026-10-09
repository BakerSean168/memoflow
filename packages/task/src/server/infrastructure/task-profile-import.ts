import type { IElectronDatabase } from '@memoflow/contracts/electron';
import { createTaskPowerSyncRepositories } from './powersync';
import type { Prisma } from '@memoflow/database';
import type { IEventBus } from '@memoflow/patterns';
import { TaskPortableCapability } from '../application/task-portability';
import { TaskCanonicalRestoreService } from '../application/services/task-canonical-restore.service';
import { createInlineTaskWriteTransactionRunner } from '../application/use-cases/commands/task-write-support';
import { TaskPlanPrismaRepository } from './adapters/prisma/task-plan-prisma.repository';
import { TaskOccurrencePrismaRepository } from './adapters/prisma/task-occurrence-prisma.repository';

// Canonical restore must not emit historical completion/Goal contribution events.
const restoredTaskEvents: IEventBus = { publish: async () => undefined };

export function createTaskPrismaPortableCapability(tx: Prisma.TransactionClient) {
  const planRepository = new TaskPlanPrismaRepository(tx, restoredTaskEvents);
  const occurrenceRepository = new TaskOccurrencePrismaRepository(tx, restoredTaskEvents);
  return new TaskPortableCapability(
    planRepository,
    occurrenceRepository,
    new TaskCanonicalRestoreService(
      createInlineTaskWriteTransactionRunner({
        planRepository,
        occurrenceRepository,
      }),
    ),
  );
}

export function createTaskPowerSyncPortableCapability(db: IElectronDatabase) {
  const repos = createTaskPowerSyncRepositories(db);
  return new TaskPortableCapability(
    repos.taskPlanRepository,
    repos.taskOccurrenceRepository,
    new TaskCanonicalRestoreService(repos.taskWriteTransactionRunner),
  );
}
