import type { Prisma, PrismaClient } from '@memoflow/database';
import type { InvocationAttempt } from '@memoflow/contracts/schedule';
import type { IInvocationAttemptRepository } from '../../../domain/repositories/i-invocation-attempt-repository';
import { PrismaInvocationAttemptMapper } from './mappers/prisma-scheduled-invocation.mapper';

export class InvocationAttemptPrismaRepository implements IInvocationAttemptRepository {
  constructor(private readonly db: PrismaClient) {}

  async append(attempt: InvocationAttempt): Promise<void> {
    await this.db.invocationAttempt.create({
      data: PrismaInvocationAttemptMapper.toCreate(attempt) as Prisma.InvocationAttemptUncheckedCreateInput,
    });
  }

  async findByIdForIdentity(identityId: string, id: string): Promise<InvocationAttempt | null> {
    const row = await this.db.invocationAttempt.findFirst({ where: { id, identityId } });
    return row ? PrismaInvocationAttemptMapper.toDomain(row) : null;
  }

  async listForInvocation(
    identityId: string,
    invocationId: string,
    options: { readonly limit?: number; readonly before?: number } = {},
  ): Promise<InvocationAttempt[]> {
    const rows = await this.db.invocationAttempt.findMany({
      where: {
        identityId,
        invocationId,
        ...(options.before === undefined ? {} : { createdAt: { lt: new Date(options.before) } }),
      },
      orderBy: { attemptNumber: 'desc' },
      ...(options.limit === undefined ? {} : { take: options.limit }),
    });
    return rows.map(PrismaInvocationAttemptMapper.toDomain);
  }

  async findLatestForInvocation(identityId: string, invocationId: string): Promise<InvocationAttempt | null> {
    const row = await this.db.invocationAttempt.findFirst({
      where: { identityId, invocationId }, orderBy: { attemptNumber: 'desc' },
    });
    return row ? PrismaInvocationAttemptMapper.toDomain(row) : null;
  }
}
