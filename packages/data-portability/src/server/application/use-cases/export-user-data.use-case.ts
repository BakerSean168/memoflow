/**
 * Export User Data Use Case
 *
 * Reads all user data from repositories, converts to portable DTOs
 * with _ref allocation, strips sensitive fields, and builds the envelope.
 */

import { createLogger } from '@memoflow/utils/logger';
import { createTypedEventPublisher, eventBus } from '@memoflow/utils/domain';
import type {
  DataPortabilityEventMap,
  UserDataExportEnvelopeV2,
  PortableUserDataV2,
  ExportableModule,
  ExportUserDataRes,
} from '@memoflow/contracts/data-portability';
import { ALL_EXPORTABLE_MODULES, DataPortabilityEventTopics } from '@memoflow/contracts/data-portability';
import type { ExportContext } from '../portable-runtime';
import { RefAllocator } from '../portable-runtime';
import type { DataPortabilityDependencies } from '../data-portability.dependencies';
import { sanitizeSensitiveFields } from '../sanitize';
import { projectGoals, projectGoalRecords } from './projections/goal.projection';
import { projectTaskPlans, projectTaskOccurrences } from './projections/task.projection';
import { projectReminderGroups, projectReminderTemplates, projectReminderResponses, projectUserReminderPreference } from './projections/reminder.projection';
import { projectRepositories, projectResourceFolders, projectResources } from './projections/repository.projection';
import { projectCalendarEntries, projectScheduleTasks } from './projections/schedule.projection';
import { projectEditorWorkspaces } from './projections/editor.projection';
import { projectAIConversations } from './projections/ai.projection';
import { projectNotificationPreference } from './projections/notification.projection';
import { projectSettings } from './projections/setting.projection';

const logger = createLogger('ExportUserData');
const dataPortabilityEvents = createTypedEventPublisher<
  Pick<DataPortabilityEventMap, typeof DataPortabilityEventTopics.EXPORTED>
>(eventBus);

// ============ Use Case ============

export class ExportUserDataUseCase {
  constructor(private readonly deps: DataPortabilityDependencies) {}

  async execute(
    identityId: string,
    include?: ExportableModule[],
  ): Promise<ExportUserDataRes> {
    const modules = include ?? ALL_EXPORTABLE_MODULES;
    const exportedAt = new Date().toISOString();
    const refAllocator = new RefAllocator();
    const refToIdMap = new Map<string, string>();
    const warnings: string[] = [];
    const entityCounts: Record<string, number> = {};

    const ctx: ExportContext = {
      identityId,
      exportedAt,
      refAllocator,
      warnings,
      refToIdMap,
    };

    const data: PortableUserDataV2 = {};

    // ─── Settings (singleton) ───
    if (modules.includes('settings')) {
      const preferences = await this.deps.userPreferenceRepository.list(identityId);
      if (preferences.length > 0) {
        data.settings = projectSettings(preferences);
        entityCounts.settings = 1;
      }
    }

    // ─── Notification Preference (singleton) ───
    if (modules.includes('notifications')) {
      const pref = await this.deps.notificationPreferenceRepository.findByIdentityId(identityId);
      if (pref) {
        data.notificationPreference = projectNotificationPreference(pref);
        entityCounts.notificationPreference = 1;
      }
    }

    // ─── User Reminder Preference (singleton) ───
    if (modules.includes('reminders')) {
      const pref = await this.deps.userReminderPreferenceRepository.findByIdentityId(identityId);
      if (pref) {
        data.userReminderPreference = projectUserReminderPreference(pref);
        entityCounts.userReminderPreference = 1;
      }
    }

    // ─── Repositories ───
    if (modules.includes('repository')) {
      const repos = await this.deps.repositoryRepository.findByIdentityId(identityId);
      const allFolders: unknown[] = [];
      const allResources: unknown[] = [];

      for (const repo of repos) {
        const r = repo as { id: string };
        const folders = await this.deps.folderRepository.findByRepositoryId(r.id);
        allFolders.push(...folders);
      }

      const resources = await this.deps.resourceRepository.findByIdentityId(identityId);
      allResources.push(...resources);

      const portableRepos = projectRepositories(repos, ctx);
      const portableFolders = projectResourceFolders(allFolders, ctx);
      const portableResources = projectResources(allResources, ctx);

      data.repositories = {
        repositories: portableRepos,
        folders: portableFolders,
        resources: portableResources,
      };
      entityCounts.repositories = portableRepos.length;
      entityCounts.resourceFolders = portableFolders.length;
      entityCounts.resources = portableResources.length;
    }

    // ─── Goals ───
    if (modules.includes('goals')) {
      const goals = await this.deps.goalRepository.findByIdentityId(identityId, { includeChildren: true });
      const goalIds = (goals as { id: string }[]).map((g) => g.id);
      const allRecords: unknown[] = [];
      for (const goalId of goalIds) {
        allRecords.push(...(await this.deps.goalRecordRepository.findByGoalId(identityId, goalId)));
      }

      const portableGoals = projectGoals(goals, ctx);
      const portableRecords = projectGoalRecords(allRecords, ctx);
      data.goals = { items: portableGoals, records: portableRecords };
      entityCounts.goals = portableGoals.length;
      entityCounts.goalRecords = portableRecords.length;
    }

    // ─── Tasks ───
    if (modules.includes('tasks')) {
      const taskPlans = await this.deps.taskPlanRepository.findByIdentityId(identityId);
      const taskOccurrences = await this.deps.taskOccurrenceRepository.findByIdentityId(identityId);
      data.tasks = {
        templates: projectTaskPlans(taskPlans, ctx),
        instances: projectTaskOccurrences(taskOccurrences, ctx),
      };
      entityCounts.taskPlans = data.tasks.templates.length;
      entityCounts.taskOccurrences = data.tasks.instances.length;
    }

    // ─── Reminders (groups + templates + responses) ───
    if (modules.includes('reminders')) {
      const groups = await this.deps.reminderGroupRepository.findByIdentityId(identityId);
      const templates = await this.deps.reminderTemplateRepository.findByIdentityId(identityId, { includeHistory: false });
      const memberships = await this.deps.routineProfileMembershipRepository.findByIdentityId(identityId);
      const routineDefinitions = await this.deps.routineDefinitionRepository.findByIdentityId(identityId);

      const allResponses: unknown[] = [];
      for (const template of templates as { id: string }[]) {
        const responses = await this.deps.reminderResponseRepository.findByTemplateId(
          template.id,
          identityId,
        );
        allResponses.push(...responses);
      }

      if (!data.reminders) data.reminders = { groups: [], templates: [], responses: [] };
      data.reminders.groups = projectReminderGroups(groups, ctx);
      data.reminders.templates = projectReminderTemplates(templates, memberships, routineDefinitions, ctx);
      data.reminders.responses = projectReminderResponses(allResponses, ctx);
      entityCounts.reminderGroups = data.reminders.groups.length;
      entityCounts.reminderTemplates = data.reminders.templates.length;
      entityCounts.reminderResponses = data.reminders.responses.length;
    }

    // ─── Schedules ───
    if (modules.includes('schedule')) {
      const entries = await this.deps.scheduleRepository.findByIdentityId(identityId);
      const scheduleTasks = await this.deps.scheduleTaskRepository.findByIdentityId(identityId);

      data.schedules = {
        entries: projectCalendarEntries(entries, ctx),
        tasks: projectScheduleTasks(scheduleTasks, ctx),
      };
      entityCounts.calendarEntries = data.schedules.entries.length;
      entityCounts.scheduleTasks = data.schedules.tasks.length;
    }

    // ─── Editor ───
    if (modules.includes('editor')) {
      const workspaces = await this.deps.editorWorkspaceRepository.findByIdentityId(identityId);
      data.editor = {
        workspaces: await projectEditorWorkspaces(workspaces, ctx, this.deps),
      };
      entityCounts.editorWorkspaces = data.editor.workspaces.length;
    }

    // ─── AI ───
    if (modules.includes('ai')) {
      const conversations = await this.deps.aiConversationRepository.findByIdentityId(identityId, { includeChildren: true });
      data.ai = {
        conversations: projectAIConversations(conversations, ctx),
      };
      entityCounts.aiConversations = data.ai.conversations.length;
    }

    // ─── Build Envelope ───
    const envelope: UserDataExportEnvelopeV2 = {
      kind: 'memoflow.user-data-export',
      schemaVersion: 2,
      exportedAt,
      exportedBy: {
        appName: 'MemoFlow',
      },
      scope: {
        includesBinaryResources: false,
        importMode: 'append-create-like',
      },
      data,
    };

    // Strip any nested sensitive fields (token, password, secret, etc.)
    const sanitized = sanitizeSensitiveFields(envelope);
    const content = JSON.stringify(sanitized, null, 2);
    const timestamp = exportedAt.replace(/[:.]/g, '-').slice(0, 19);
    const fileName = `memoflow-user-data-v2-${timestamp}.json`;

    logger.info('Export completed', { identityId, entityCounts, warnings: warnings.length });

    const exportedEvent: DataPortabilityEventMap[typeof DataPortabilityEventTopics.EXPORTED] = {
      identityId,
      requestedModules: modules,
      fileName,
      entityCounts,
      warnings,
    };
    dataPortabilityEvents.send(DataPortabilityEventTopics.EXPORTED, exportedEvent);

    return {
      fileName,
      content,
      summary: { entityCounts, warnings },
    };
  }
}
