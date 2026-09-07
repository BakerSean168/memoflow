import type { IScheduleExecutionRepository } from '../../../domain/repositories/i-schedule-execution-repository';
import { ScheduleExecution } from '../../../domain/entities/schedule-execution';
import type { PrismaClient, Prisma } from '@memoflow/database';
import { PrismaScheduleExecutionMapper } from './mappers/prisma-schedule-execution-mapper';

export class ScheduleExecutionPrismaRepository implements IScheduleExecutionRepository {
  constructor(private prisma: PrismaClient) {}

  async save(execution: ScheduleExecution): Promise<void> {
    const data = PrismaScheduleExecutionMapper.toCreateInput(execution) as Record<string, unknown> & { id: string };

    await this.prisma.scheduleExecution.upsert({
      where: { id: data.id },
      update: data as Prisma.ScheduleExecutionUpdateInput,
      create: data as Prisma.ScheduleExecutionCreateInput,
    });
  }

  async findByIdForIdentity(identityId: string, id: string): Promise<ScheduleExecution | null> {
    const data = await this.prisma.scheduleExecution.findFirst({
      where: { id, identityId },
    });
    return data ? PrismaScheduleExecutionMapper.toDomain(data) : null;
  }

  async findByTaskId(identityId: string, taskId: string): Promise<ScheduleExecution[]> {
    const data = await this.prisma.scheduleExecution.findMany({
      where: { identityId, taskId },
      orderBy: { executionTime: 'desc' },
    });
    return data.map((d) => PrismaScheduleExecutionMapper.toDomain(d));
  }
}
