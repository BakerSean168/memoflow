import type { Prisma } from '@memoflow/database';
import { createSystemClock } from '@memoflow/time';
import { createLabelPortableCapability } from '../application/label-portability';
import { LabelService } from '../application/label-service';
import { PrismaLabelRepository } from './prisma/prisma-label.repository';

export function createLabelPrismaPortableCapability(tx: Prisma.TransactionClient) {
  return createLabelPortableCapability(
    new LabelService(new PrismaLabelRepository(tx), {
      clock: createSystemClock(),
    }),
  );
}
