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
  UpsertUserSettingInput,
  UpsertNotificationPreferenceInput,
  UpsertUserReminderPreferenceInput,
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
  CreateScheduleTaskInput,
  CreateReminderGroupInput,
  CreateReminderTemplateInput,
  CreateReminderResponseInput,
  CreateEditorWorkspaceInput,
  CreateEditorSessionInput,
  CreateEditorGroupInput,
  CreateEditorTabInput,
  CreateAIConversationInput,
  CreateAIMessageInput,
} from '../../application/import-store/data-portability-import-store';

class PrismaDataPortabilityImportTx implements DataPortabilityImportTx {
  constructor(private readonly tx: Prisma.TransactionClient) {}

  // --- Singletons ---

  async upsertUserSetting(input: UpsertUserSettingInput): Promise<void> {
    await this.tx.userSetting.upsert({
      where: { identityId: input.identityId },
      create: { identityId: input.identityId, preferences: input.preferences as never },
      update: { preferences: input.preferences as never },
    });
  }

  async upsertNotificationPreference(input: UpsertNotificationPreferenceInput): Promise<void> {
    await this.tx.notificationPreference.upsert({
      where: { identityId: input.identityId },
      create: {
        id: input.id,
        identityId: input.identityId,
        globalChannels: input.globalChannels,
        workflowOverrides: input.workflowOverrides,
        doNotDisturb: input.doNotDisturb,
        rateLimit: input.rateLimit,
      },
      update: {
        globalChannels: input.globalChannels,
        workflowOverrides: input.workflowOverrides,
        doNotDisturb: input.doNotDisturb,
        rateLimit: input.rateLimit,
      },
    });
  }

  async upsertUserReminderPreference(input: UpsertUserReminderPreferenceInput): Promise<void> {
    await this.tx.userReminderPreference.upsert({
      where: { identityId: input.identityId },
      create: {
        id: input.id,
        identityId: input.identityId,
        bestTimeSlots: input.bestTimeSlots,
        worstTimeSlots: input.worstTimeSlots,
        globalReminderEnabled: input.globalReminderEnabled,
      },
      update: {
        bestTimeSlots: input.bestTimeSlots,
        worstTimeSlots: input.worstTimeSlots,
        globalReminderEnabled: input.globalReminderEnabled,
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
      data: input as unknown as Prisma.TaskPlanUncheckedCreateInput,
    });
  }

  async createTaskOccurrence(input: CreateTaskOccurrenceInput): Promise<void> {
    await this.tx.taskOccurrence.create({
      data: input as unknown as Prisma.TaskOccurrenceUncheckedCreateInput,
    });
  }

  // --- Schedule ---

  async createSchedule(input: CreateScheduleInput): Promise<void> {
    await this.tx.schedule.create({ data: input });
  }

  async createScheduleTask(input: CreateScheduleTaskInput): Promise<void> {
    await this.tx.scheduleTask.create({ data: input as Prisma.ScheduleTaskUncheckedCreateInput });
  }

  // --- Reminder ---

  async createReminderGroup(input: CreateReminderGroupInput): Promise<void> {
    await this.tx.reminderGroup.create({ data: input });
    await this.tx.routineProfile.create({
      data: {
        id: input.id,
        identityId: input.identityId,
        name: input.name,
        description: input.description,
        enabled: input.enabled,
        active: input.status.toLowerCase() === 'active',
        createdAt: input.createdAt,
        updatedAt: input.updatedAt,
      },
    });
  }

  async createReminderTemplate(input: CreateReminderTemplateInput): Promise<void> {
    const { routineEnabled, routineTrigger, profileMemberships, ...templateInput } = input;
    await this.tx.reminderTemplate.create({ data: templateInput });
    await this.tx.routineDefinition.create({
      data: {
        id: input.id,
        identityId: input.identityId,
        name: input.name,
        description: input.description,
        enabled: routineEnabled,
        triggerJson: routineTrigger == null ? null : JSON.stringify(routineTrigger),
        createdAt: input.createdAt,
        updatedAt: input.updatedAt,
      },
    });
    for (const membership of profileMemberships) {
      await this.tx.routineProfileMembership.create({
        data: {
          identityId: input.identityId,
          profileId: membership.profileId,
          routineId: input.id,
          enabled: membership.enabled,
          createdAt: input.createdAt,
          updatedAt: input.updatedAt,
        },
      });
    }
  }

  async createReminderResponse(input: CreateReminderResponseInput): Promise<void> {
    await this.tx.reminderResponse.create({
      data: input as Prisma.ReminderResponseUncheckedCreateInput,
    });
  }

  // --- Editor ---

  async createEditorWorkspace(input: CreateEditorWorkspaceInput): Promise<void> {
    await this.tx.editorWorkspace.create({
      data: input as Prisma.EditorWorkspaceUncheckedCreateInput,
    });
  }

  async createEditorSession(input: CreateEditorSessionInput): Promise<void> {
    await this.tx.editorWorkspaceSession.create({
      data: input as Prisma.EditorWorkspaceSessionUncheckedCreateInput,
    });
  }

  async createEditorGroup(input: CreateEditorGroupInput): Promise<void> {
    await this.tx.editorWorkspaceSessionGroup.create({
      data: input as Prisma.EditorWorkspaceSessionGroupUncheckedCreateInput,
    });
  }

  async createEditorTab(input: CreateEditorTabInput): Promise<void> {
    await this.tx.editorWorkspaceSessionGroupTab.create({
      data: input as Prisma.EditorWorkspaceSessionGroupTabUncheckedCreateInput,
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
