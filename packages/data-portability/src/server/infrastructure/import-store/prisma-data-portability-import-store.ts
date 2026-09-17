/**
 * Prisma implementation of DataPortabilityImportStore.
 * DataPortabilityImportStore 的 Prisma 实现。
 *
 * Wraps prisma.$transaction() and delegates each create/upsert
 * to the corresponding Prisma model.
 *
 * 将整个 import callback 包装在 prisma.$transaction() 内，
 * 并把每个 create/upsert 委托给对应的 Prisma model。
 */

import type { PrismaClient, Prisma } from '@memoflow/database';
import type {
  DataPortabilityImportStore,
  DataPortabilityImportTx,
  UpsertUserPreferencesInput,
  UpsertNotificationPreferenceInput,
  CreateRepositoryInput,
  CreateResourceFolderInput,
  CreateResourceInput,
  CreateGoalInput,
  CreateKeyResultInput,
  CreateGoalReviewInput,
  CreateGoalRecordInput,
  CreateTaskPlanInput,
  CreateTaskOccurrenceInput,
  CreateScheduleInput,
  CreateAIConversationInput,
  CreateAIMessageInput,
} from '../../application/import-store/data-portability-import-store';

class PrismaDataPortabilityImportTx implements DataPortabilityImportTx {
  constructor(private readonly tx: Prisma.TransactionClient) {}

  // --- Singletons ---

  async upsertUserPreferences(input: UpsertUserPreferencesInput): Promise<void> {
    for (const [namespace, payload] of [
      ['presentation', input.presentation],
      ['regional', input.regional],
    ] as const) {
      await this.tx.userPreferenceRecord.upsert({
        where: { identityId_namespace: { identityId: input.identityId, namespace } },
        create: { identityId: input.identityId, namespace, payload: payload as never, revision: 1 },
        update: { payload: payload as never, revision: { increment: 1 } },
      });
    }
  }

  async upsertNotificationPreference(input: UpsertNotificationPreferenceInput): Promise<void> {
    await this.tx.notificationPreference.upsert({
      where: { identityId: input.identityId },
      create: {
        id: input.id,
        identityId: input.identityId,
        globalChannels: input.globalChannels,
        workflowOverrides: input.workflowOverrides,
      },
      update: {
        globalChannels: input.globalChannels,
        workflowOverrides: input.workflowOverrides,
      },
    });
  }

  // --- Repository ---

  async createRepository(input: CreateRepositoryInput): Promise<void> {
    await this.tx.repository.create({ data: input as Prisma.RepositoryUncheckedCreateInput });
  }

  async createResourceFolder(input: CreateResourceFolderInput): Promise<void> {
    await this.tx.folder.create({ data: input as Prisma.FolderUncheckedCreateInput });
  }

  async createResource(input: CreateResourceInput): Promise<void> {
    await this.tx.resource.create({ data: input as Prisma.ResourceUncheckedCreateInput });
  }

  // --- Goal ---

  async createGoal(input: CreateGoalInput): Promise<void> {
    await this.tx.goal.create({ data: input as unknown as Prisma.GoalUncheckedCreateInput });
  }

  async createKeyResult(input: CreateKeyResultInput): Promise<void> {
    await this.tx.keyResult.create({
      data: input as unknown as Prisma.KeyResultUncheckedCreateInput,
    });
  }

  async createGoalReview(input: CreateGoalReviewInput): Promise<void> {
    await this.tx.goalReview.create({
      data: input as unknown as Prisma.GoalReviewUncheckedCreateInput,
    });
  }

  async createGoalRecord(input: CreateGoalRecordInput): Promise<void> {
    await this.tx.goalRecord.create({
      data: input as unknown as Prisma.GoalRecordUncheckedCreateInput,
    });
  }

  // --- Task ---

  async createTaskPlan(input: CreateTaskPlanInput): Promise<void> {
    await this.tx.taskPlan.create({
      data: {
        id: input.id,
        identityId: input.identityId,
        name: input.name,
        description: input.description,
        status: input.status,
        outcome: input.outcome,
        completionPolicy: input.completionPolicy,
        closedAt: input.closedAt,
        archivedAt: input.archivedAt,
        abandonedReason: input.abandonedReason,
        importance: input.importance,
        schedule: input.schedule as Prisma.InputJsonValue,
        reminderConfig: input.reminderConfig,
        goalId: input.goalId,
        keyResultId: input.keyResultId,
        goalRecordValue: input.goalRecordValue,
        goalProgressTrigger: input.goalProgressTrigger,
        checklist: input.checklist,
        createdAt: input.createdAt,
        updatedAt: input.updatedAt,
      },
    });
  }

  async createTaskOccurrence(input: CreateTaskOccurrenceInput): Promise<void> {
    await this.tx.taskOccurrence.create({
      data: input as unknown as Prisma.TaskOccurrenceUncheckedCreateInput,
    });
  }

  // --- Schedule ---

  async createSchedule(input: CreateScheduleInput): Promise<void> {
    // P4-2301A compatibility boundary: current portable Schedule V3 still carries a
    // legacy timed start/end shape. Import it as canonical Timed range truth without
    // resurrecting duration/priority persistence. PORT-1611 owns the portable range cutover.
    await this.tx.schedule.create({
      data: {
        id: input.id,
        identityId: input.identityId,
        title: input.title,
        description: input.description,
        rangeKind: 'Timed',
        timedStart: new Date(input.startTime),
        timedEnd: new Date(input.endTime),
        allDayStart: null,
        allDayEnd: null,
        location: input.location,
        attendees: input.attendees,
        createdAt: input.createdAt ? new Date(input.createdAt) : undefined,
        updatedAt: input.updatedAt ? new Date(input.updatedAt) : undefined,
      },
    });
  }


  // --- AI ---

  async createAIConversation(input: CreateAIConversationInput): Promise<void> {
    await this.tx.aiConversation.create({
      data: input as Prisma.AiConversationUncheckedCreateInput,
    });
  }

  async createAIMessage(input: CreateAIMessageInput): Promise<void> {
    await this.tx.aiMessage.create({ data: input as Prisma.AiMessageUncheckedCreateInput });
  }
}

export class PrismaDataPortabilityImportStore implements DataPortabilityImportStore {
  constructor(private readonly prisma: PrismaClient) {}

  async transaction<T>(fn: (tx: DataPortabilityImportTx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (prismaTx) => {
      const tx = new PrismaDataPortabilityImportTx(prismaTx);
      return fn(tx);
    });
  }
}
