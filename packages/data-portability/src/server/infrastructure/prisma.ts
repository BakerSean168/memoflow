import type { PrismaClient } from '@memoflow/database';
import { PrismaDataPortabilityImportStore } from './import-store/prisma-data-portability-import-store';
import type { DataPortabilityImportStore } from '../application/import-store/data-portability-import-store';
import type { DataPortabilityDependencies } from '../application/data-portability.dependencies';
import {
  PrismaRepositoryAdapter,
  PrismaFolderAdapter,
  PrismaResourceAdapter,
  PrismaScheduleAdapter,
  PrismaScheduleTaskAdapter,
  PrismaEditorWorkspaceAdapter,
  PrismaEditorSessionAdapter,
  PrismaEditorGroupAdapter,
  PrismaEditorTabAdapter,
  PrismaAIConversationAdapter,
  PrismaRoutineProfileMembershipAdapter,
  PrismaRoutineDefinitionAdapter,
} from './adapters/prisma-adapters';
import {
  createDataPortabilityModule,
  type DataPortabilityModuleInstance,
  type DataPortabilityModuleRuntimeContribution,
} from './data-portability.module';
import { createGoalPrismaRepositories } from '@memoflow/goal';
import { createTaskPrismaRepositories } from '@memoflow/task';
import { createReminderPrismaRepositories } from '@memoflow/reminder';
import { createNotificationPrismaRepositories } from '@memoflow/notification';
import { createSettingPrismaRepository } from '@memoflow/setting';

export interface CreateDataPortabilityPrismaModuleOptions {
  readonly runtimeContributions?:
    | DataPortabilityModuleRuntimeContribution
    | readonly DataPortabilityModuleRuntimeContribution[];
}

/**
 * Host-facing data portability repository set.
 * 面向宿主暴露的 data portability 仓储集合。
 *
 * Alias for the complete cross-module export dependency shape (the repository
 * Port fields listed in `data-portability.dependencies.ts`).
 * Both the Prisma and the PowerSync ingredient factories return exactly this
 * shape, so hosts select the lane without importing any concrete adapter.
 *
 * `DataPortabilityDependencies` 的别名——即完整的跨模块导出依赖形状
 * （`data-portability.dependencies.ts` 中列出的仓储 Port 字段）。
 * Prisma 与 PowerSync 两个原料工厂都返回该形状，宿主无需导入任何具体适配器即可选择 lane。
 */
export type DataPortabilityRepositorySet = DataPortabilityDependencies;

/**
 * Creates a Prisma-backed data portability import store.
 * 创建基于 Prisma 的 data portability import store。
 *
 * Host-level composition ingredient: returns the `DataPortabilityImportStore`
 * port backed by the Prisma adapter, so hosts never import the concrete class.
 *
 * 宿主级组合原料：返回由 Prisma 适配器支撑的 `DataPortabilityImportStore` Port，
 * 宿主无需导入具体类。
 *
 * @param db - Prisma client owned by the host runtime. 宿主运行时持有的 Prisma client。
 * @returns A Prisma-backed import store port. 基于 Prisma 的 import store Port。
 */
export function createPrismaDataPortabilityImportStore(
  db: PrismaClient,
): DataPortabilityImportStore {
  return new PrismaDataPortabilityImportStore(db);
}

export function createPrismaDataPortabilityDependencies(
  db: PrismaClient,
): DataPortabilityDependencies {
  const goalRepos = createGoalPrismaRepositories(db);
  const taskRepos = createTaskPrismaRepositories(db);
  const reminderRepos = createReminderPrismaRepositories(db);
  const notificationRepos = createNotificationPrismaRepositories(db);
  const settingRepo = createSettingPrismaRepository(db);

  return {
    goalRepository: goalRepos.goalRepository,
    goalRecordRepository: goalRepos.goalRecordRepository,
    taskTemplateRepository: taskRepos.taskTemplateRepository,
    taskInstanceRepository: taskRepos.taskInstanceRepository,
    reminderTemplateRepository: reminderRepos.reminderTemplateRepository,
    reminderGroupRepository: reminderRepos.reminderGroupRepository,
    reminderResponseRepository: reminderRepos.reminderResponseRepository,
    routineProfileMembershipRepository: new PrismaRoutineProfileMembershipAdapter(db),
    routineDefinitionRepository: new PrismaRoutineDefinitionAdapter(db),
    userReminderPreferenceRepository: reminderRepos.userReminderPreferenceRepository,
    repositoryRepository: new PrismaRepositoryAdapter(db),
    folderRepository: new PrismaFolderAdapter(db),
    resourceRepository: new PrismaResourceAdapter(db),
    scheduleRepository: new PrismaScheduleAdapter(db),
    scheduleTaskRepository: new PrismaScheduleTaskAdapter(db),
    editorWorkspaceRepository: new PrismaEditorWorkspaceAdapter(db),
    editorSessionRepository: new PrismaEditorSessionAdapter(db),
    editorGroupRepository: new PrismaEditorGroupAdapter(db),
    editorTabRepository: new PrismaEditorTabAdapter(db),
    aiConversationRepository: new PrismaAIConversationAdapter(db),
    notificationPreferenceRepository: notificationRepos.notificationPreferenceRepository,
    settingRepository: settingRepo,
  };
}

export function createDataPortabilityPrismaModule(
  db: PrismaClient,
  options: CreateDataPortabilityPrismaModuleOptions = {},
): DataPortabilityModuleInstance {
  return createDataPortabilityModule({
    exportDependencies: createPrismaDataPortabilityDependencies(db),
    importStore: createPrismaDataPortabilityImportStore(db),
    runtimeContributions: options.runtimeContributions,
  });
}
