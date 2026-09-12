import type { PrismaClient } from '@memoflow/database';
import { IdentityId } from '@memoflow/domain-shared/shared';
import { Account, type IAccountRepository } from '../domain';
import type { Clock } from '@memoflow/time';
import { createAccountPrismaRepository } from './prisma';

export interface CloudAccountProvisioningInput {
  readonly identityId: string;
  readonly email: string;
  readonly name: string;
  readonly emailVerified: boolean;
}

export function createCloudAccountProvisionerFromRepository(
  repository: IAccountRepository,
  clock: Clock,
): {
  provision(input: CloudAccountProvisioningInput): Promise<void>;
} {
  return {
    async provision(input) {
      const existing = await repository.findById(input.identityId);
      if (existing) return;

      const displayName = input.name.trim();
      const emailLocalPart = input.email.split('@')[0] ?? '';
      const nicknameSeed = displayName.length >= 2 ? displayName : emailLocalPart;
      const account = Account.create({
        id: IdentityId.of(input.identityId),
        nicknameSeed,
        now: clock.now(),
      });
      await repository.save(account);
    },
  };
}

export function createCloudAccountProvisioner(
  db: PrismaClient,
  clock: Clock,
): {
  provision(input: CloudAccountProvisioningInput): Promise<void>;
} {
  return createCloudAccountProvisionerFromRepository(createAccountPrismaRepository(db), clock);
}
