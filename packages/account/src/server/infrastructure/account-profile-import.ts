import type { IElectronDatabase } from '@memoflow/contracts/electron';
import { createAccountPowerSyncRepositories } from './powersync';
import type { Prisma } from '@memoflow/database';
import { createSystemClock, type UserTimeContextPort } from '@memoflow/time';
import { createAccountProfilePortableCapability } from '../application/account-portability';
import { PrismaAccountRepository } from './adapters/prisma/account-prisma.repository';

export function createAccountPrismaPortableCapability(
  tx: Prisma.TransactionClient,
  time: UserTimeContextPort,
) {
  // Profile restoration has no lifecycle notification side effects.
  const repository = new PrismaAccountRepository(tx, { publish: async () => undefined });
  return createAccountProfilePortableCapability(repository, createSystemClock(), time);
}

export function createAccountPowerSyncPortableCapability(
  db: IElectronDatabase,
  time: UserTimeContextPort,
) {
  return createAccountProfilePortableCapability(
    createAccountPowerSyncRepositories(db).accountRepository,
    createSystemClock(),
    time,
  );
}
