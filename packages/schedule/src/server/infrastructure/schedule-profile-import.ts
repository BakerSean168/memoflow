import type { Prisma } from '@memoflow/database';
import { createSchedulePortableCapability } from '../application/schedule-portability';
import { SchedulePrismaRepository } from './adapters/prisma/schedule-prisma.repository';

export function createSchedulePrismaPortableCapability(tx: Prisma.TransactionClient) {
  return createSchedulePortableCapability(new SchedulePrismaRepository(tx));
}
