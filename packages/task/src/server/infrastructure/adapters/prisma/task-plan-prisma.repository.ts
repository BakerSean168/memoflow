/**
 * TaskPlanPrismaRepository - Prisma Implementation of ITaskPlanRepository
 * 任务模板仓储 - Prisma 实现
 *
 * 聚合根：TaskPlan
 *
 * Extends AggregateRepositoryBase to automatically publish domain events after persistence.
 */

import type { PrismaClient, TaskPlan as PrismaTaskPlan } from '@memoflow/database';
import { TaskPlan } from '../../../domain/aggregates/task-plan';
import {
  TaskLabelOwnershipError,
  type ITaskPlanRepository,
  type TaskFilters,
} from '../../../domain/repositories/i-task-plan-repository';
import type { TaskPlanStatus } from '@memoflow/contracts/task';
import { LabelColorSchema, type LabelClientDTO } from '@memoflow/contracts/label';
import { AggregateRepositoryBase, createEventBusAdapter, type IEventBus } from '@memoflow/patterns';
import { eventBus } from '@memoflow/utils/domain';
import { PrismaTaskPlanMapper } from './mappers/prisma-task-plan-mapper';
import { OptimisticConcurrencyError } from '../../../domain/errors/optimistic-concurrency.error';

const eventBusAdapter = createEventBusAdapter(eventBus);

interface TaskPlanDb {
  taskPlan: PrismaClient['taskPlan'];
  taskLabel: PrismaClient['taskLabel'];
  label: PrismaClient['label'];
}

export class TaskPlanPrismaRepository
  extends AggregateRepositoryBase<TaskPlan>
  implements ITaskPlanRepository
{
  private readonly db: TaskPlanDb;

  constructor(prisma: PrismaClient, eventBus?: IEventBus);
  constructor(prisma: TaskPlanDb, eventBus?: IEventBus);
  constructor(prisma: TaskPlanDb | PrismaClient, eventBus: IEventBus = eventBusAdapter) {
    super(eventBus);
    this.db = prisma;
  }

  /**
   * Prisma record -> TaskPlan 聚合根
   */
  private mapToEntity(data: PrismaTaskPlan): TaskPlan {
    return PrismaTaskPlanMapper.toDomain(data);
  }

  private static labelDto(row: {
    id: string;
    name: string;
    color: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): LabelClientDTO {
    return {
      id: row.id,
      name: row.name,
      color: row.color == null ? null : LabelColorSchema.parse(row.color),
      createdAt: row.createdAt.getTime(),
      updatedAt: row.updatedAt.getTime(),
    };
  }

  private async loadLabelMap(
    identityId: string,
    taskPlanIds: readonly string[],
  ): Promise<Map<string, LabelClientDTO[]>> {
    const ids = [...new Set(taskPlanIds)];
    const result = new Map(ids.map((id) => [id, [] as LabelClientDTO[]]));
    if (ids.length === 0) return result;

    const links = await this.db.taskLabel.findMany({
      where: { identityId, taskPlanId: { in: ids } },
      include: { label: true },
      orderBy: [{ taskPlanId: 'asc' }, { label: { name: 'asc' } }],
    });
    for (const { taskPlanId, label } of links) {
      result.get(taskPlanId)?.push(TaskPlanPrismaRepository.labelDto(label));
    }
    return result;
  }

  private async hydrateTemplates(identityId: string, templates: TaskPlan[]): Promise<TaskPlan[]> {
    const labelMap = await this.loadLabelMap(
      identityId,
      templates.map((template) => String(template.id)),
    );
    for (const template of templates) {
      template.hydrateLabels(labelMap.get(String(template.id)) ?? []);
    }
    return templates;
  }

  private async hydrateTemplate(
    identityId: string,
    template: TaskPlan | null,
  ): Promise<TaskPlan | null> {
    if (!template) return null;
    await this.hydrateTemplates(identityId, [template]);
    return template;
  }

  /**
   * TaskPlan 聚合根 -> Prisma write data
   */
  private toWriteData(template: TaskPlan) {
    return PrismaTaskPlanMapper.toPersistence(template);
  }

  /**
   * Protected persistence method - called by base class before event publishing
   *
   * R2-5a：乐观锁——已存在模板必须匹配 `version: template.version - 1`，
   * 否则并发修改抛 OptimisticConcurrencyError；不存在则 create。
   */
  protected async persist(template: TaskPlan): Promise<void> {
    const data = this.toWriteData(template);

    const updated = await this.db.taskPlan.updateMany({
      where: { id: template.id, version: template.version - 1 },
      data,
    });

    if (updated.count === 0) {
      const existing = await this.db.taskPlan.findUnique({
        where: { id: template.id },
        select: { id: true, version: true },
      });
      if (existing) {
        throw new OptimisticConcurrencyError(
          'TaskPlan',
          String(template.id),
          template.version - 1,
          existing.version,
        );
      }
      await this.db.taskPlan.create({
        data: {
          id: template.id,
          ...data,
          createdAt: new Date(template.createdAt),
        },
      });
    }
  }

  async findByIdForIdentity(identityId: string, id: string): Promise<TaskPlan | null> {
    const data = await this.db.taskPlan.findFirst({
      where: { id, identityId },
    });
    return this.hydrateTemplate(identityId, data ? this.mapToEntity(data) : null);
  }

  async findByIdWithChildren(identityId: string, id: string): Promise<TaskPlan | null> {
    const data = await this.db.taskPlan.findFirst({
      where: { id, identityId },
      include: { instances: true },
    });
    return this.hydrateTemplate(identityId, data ? this.mapToEntity(data) : null);
  }

  async findByIdentityId(identityId: string): Promise<TaskPlan[]> {
    const data = await this.db.taskPlan.findMany({
      where: { identityId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return this.hydrateTemplates(
      identityId,
      data.map((record: PrismaTaskPlan) => this.mapToEntity(record)),
    );
  }

  async findByStatus(identityId: string, status: TaskPlanStatus): Promise<TaskPlan[]> {
    const data = await this.db.taskPlan.findMany({
      where: { identityId, status, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return this.hydrateTemplates(
      identityId,
      data.map((record: PrismaTaskPlan) => this.mapToEntity(record)),
    );
  }

  async findActiveTemplates(identityId: string): Promise<TaskPlan[]> {
    const data = await this.db.taskPlan.findMany({
      where: {
        identityId,
        status: 'Active',
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });
    return this.hydrateTemplates(
      identityId,
      data.map((record: PrismaTaskPlan) => this.mapToEntity(record)),
    );
  }

  async findByGoalId(identityId: string, goalId: string): Promise<TaskPlan[]> {
    const data = await this.db.taskPlan.findMany({
      where: {
        identityId,
        goalId,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });
    return this.hydrateTemplates(
      identityId,
      data.map((record: PrismaTaskPlan) => this.mapToEntity(record)),
    );
  }

  async findByLabelIdsAll(identityId: string, labelIds: readonly string[]): Promise<TaskPlan[]> {
    const requiredLabelIds = [...new Set(labelIds)];
    if (requiredLabelIds.length === 0) return this.findByIdentityId(identityId);

    const links = await this.db.taskLabel.findMany({
      where: { identityId, labelId: { in: requiredLabelIds } },
      select: { taskPlanId: true, labelId: true },
    });
    const found = new Map<string, Set<string>>();
    for (const link of links) {
      const set = found.get(link.taskPlanId) ?? new Set<string>();
      set.add(link.labelId);
      found.set(link.taskPlanId, set);
    }
    const matchingIds = [...found.entries()]
      .filter(([, labels]) => requiredLabelIds.every((labelId) => labels.has(labelId)))
      .map(([taskPlanId]) => taskPlanId);
    if (matchingIds.length === 0) return [];

    const rows = await this.db.taskPlan.findMany({
      where: { identityId, id: { in: matchingIds }, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return this.hydrateTemplates(
      identityId,
      rows.map((record: PrismaTaskPlan) => this.mapToEntity(record)),
    );
  }

  async replaceLabels(
    identityId: string,
    taskPlanId: string,
    labelIds: readonly string[],
  ): Promise<LabelClientDTO[]> {
    const owner = await this.db.taskPlan.findFirst({
      where: { id: taskPlanId, identityId },
      select: { id: true },
    });
    if (!owner) throw new Error('Task template not found.');

    const uniqueIds = [...new Set(labelIds)];
    if (uniqueIds.length > 0) {
      const count = await this.db.label.count({
        where: { identityId, id: { in: uniqueIds } },
      });
      if (count !== uniqueIds.length) throw new TaskLabelOwnershipError();
    }

    await this.db.taskLabel.deleteMany({ where: { identityId, taskPlanId } });
    if (uniqueIds.length > 0) {
      await this.db.taskLabel.createMany({
        data: uniqueIds.map((labelId) => ({ identityId, taskPlanId, labelId })),
      });
    }
    return (await this.loadLabelMap(identityId, [taskPlanId])).get(taskPlanId) ?? [];
  }

  async findAllTemplateRefs(): Promise<Array<{ id: string; identityId: string }>> {
    const rows = await this.db.taskPlan.findMany({
      select: { id: true, identityId: true },
    });
    return rows.map((row) => ({ id: row.id, identityId: row.identityId }));
  }

  async findNeedGenerateInstances(toDate: number): Promise<TaskPlan[]> {
    const data = await this.db.taskPlan.findMany({
      where: {
        recurrenceRuleType: { not: null },
        status: 'Active',
        deletedAt: null,
        OR: [{ lastGeneratedDate: null }, { lastGeneratedDate: { lt: new Date(toDate) } }],
      },
    });
    return data.map((record: PrismaTaskPlan) => this.mapToEntity(record));
  }

  async delete(identityId: string, id: string): Promise<void> {
    const deleted = await this.db.taskPlan.deleteMany({
      where: { id, identityId },
    });
    if (deleted.count !== 1) {
      throw new Error('Task template not found for the current identity.');
    }
  }

  async softDelete(identityId: string, id: string): Promise<void> {
    const result = await this.db.taskPlan.updateMany({
      where: { id, identityId },
      data: { deletedAt: new Date() },
    });
    if (result.count !== 1) {
      throw new Error('Task template not found for the current identity.');
    }
  }

  async restore(identityId: string, id: string): Promise<void> {
    const result = await this.db.taskPlan.updateMany({
      where: { id, identityId },
      data: { deletedAt: null },
    });
    if (result.count !== 1) {
      throw new Error('Task template not found for the current identity.');
    }
  }

  async findOneTimeTasks(identityId: string, filters?: TaskFilters): Promise<TaskPlan[]> {
    const data = await this.db.taskPlan.findMany({
      where: {
        identityId,
        recurrenceRuleType: null,
        deletedAt: null,
        ...(filters?.status ? { status: filters.status } : {}),
      },
      take: filters?.limit,
      skip: filters?.offset,
      orderBy: { createdAt: 'desc' },
    });
    return this.hydrateTemplates(
      identityId,
      data.map((record: PrismaTaskPlan) => this.mapToEntity(record)),
    );
  }

  async findRecurringTasks(identityId: string, filters?: TaskFilters): Promise<TaskPlan[]> {
    const data = await this.db.taskPlan.findMany({
      where: {
        identityId,
        recurrenceRuleType: { not: null },
        deletedAt: null,
        ...(filters?.status ? { status: filters.status } : {}),
      },
      take: filters?.limit,
      skip: filters?.offset,
      orderBy: { createdAt: 'desc' },
    });
    return this.hydrateTemplates(
      identityId,
      data.map((record: PrismaTaskPlan) => this.mapToEntity(record)),
    );
  }

  async findByGoalAndKeyResultId(
    identityId: string,
    goalId: string,
    keyResultId: string,
  ): Promise<TaskPlan[]> {
    const data = await this.db.taskPlan.findMany({
      where: {
        identityId,
        goalId,
        keyResultId,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });
    return this.hydrateTemplates(
      identityId,
      data.map((record: PrismaTaskPlan) => this.mapToEntity(record)),
    );
  }

  async countTasks(identityId: string, filters?: TaskFilters): Promise<number> {
    return this.db.taskPlan.count({
      where: {
        identityId,
        deletedAt: null,
        ...(filters?.status ? { status: filters.status } : {}),
      },
    });
  }

  /**
   * Persist templates sequentially on the bound client.
   * Avoid nested `$transaction` when already inside an interactive transaction.
   */
  async saveBatch(templates: TaskPlan[]): Promise<void> {
    for (const template of templates) {
      await this.persist(template);
    }
  }

  async deleteBatch(identityId: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.db.taskPlan.deleteMany({
      where: { id: { in: ids }, identityId },
    });
  }
}
