import type { Prisma } from '@memoflow/database';
import type { PortableCapability } from '@memoflow/contracts/data-portability';
import { createAccountPrismaPortableCapability } from '@memoflow/account';
import { createAiPrismaPortableCapability } from '@memoflow/ai';
import { createGoalPrismaPortableCapability } from '@memoflow/goal';
import { createTaskPrismaPortableCapability } from '@memoflow/task';
import { createLabelPrismaPortableCapability } from '@memoflow/label';
import { createSchedulePrismaPortableCapability } from '@memoflow/schedule';
import { createSettingPrismaPortability } from '@memoflow/setting';
import { createNotificationPrismaPortability } from '@memoflow/notification';
import {
  createRoutinePrismaRepositories,
  createRoutinePortableCapability,
} from '@memoflow/reminder';

/** Owner restore seams only: no second runtime, timers, transports, or independent commits. */
export function composeProfileImportCapabilities(
  tx: Prisma.TransactionClient,
): readonly PortableCapability<unknown>[] {
  const setting = createSettingPrismaPortability(tx);
  const notification = createNotificationPrismaPortability(tx);
  return [
    setting.portableCapability,
    createAccountPrismaPortableCapability(tx, setting.userTimeContextPort),
    notification.portableCapability,
    createLabelPrismaPortableCapability(tx),
    createGoalPrismaPortableCapability(tx),
    createTaskPrismaPortableCapability(tx),
    createSchedulePrismaPortableCapability(tx),
    createRoutinePortableCapability(createRoutinePrismaRepositories(tx)),
    notification.portableFactCapability,
    createAiPrismaPortableCapability(tx),
  ];
}
