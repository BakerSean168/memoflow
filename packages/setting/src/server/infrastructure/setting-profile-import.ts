import type { Prisma } from '@memoflow/database';
import { createSettingModule } from './setting.module';
import { UserPreferencePrismaRepository } from './adapters/prisma/user-preference-prisma.repository';

export function createSettingPrismaPortability(tx: Prisma.TransactionClient) {
  const instance = createSettingModule({
    userPreferenceRepository: new UserPreferencePrismaRepository(tx),
  });
  return {
    portableCapability: instance.portableCapability,
    userTimeContextPort: instance.userTimeContextPort,
  };
}
