/**
 * createReminderModule — explicit composition root for the reminder server runtime.
 * createReminderModule —— 提醒模块服务端运行时的显式组合根。
 */

import type { IReminderTemplateRepository } from '../domain/repositories/i-reminder-template-repository';
import type { IReminderGroupRepository } from '../domain/repositories/i-reminder-group-repository';
import type { IReminderResponseRepository } from '../domain/repositories/i-reminder-response-repository';
import type { RoutineProfileStore } from '../domain/ports/routine-profile-store.port';
import type { IUserReminderPreferenceRepository } from '../domain/repositories/i-user-reminder-preference-repository';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import { fail, ok } from '@memoflow/contracts/result';
import type { ReminderResponseAction } from '@memoflow/contracts/reminder';
import type {
  BusinessOperationReceipt,
  ReminderReliableOperationPort,
  ReminderReplayDeadLetterInput,
} from '@memoflow/contracts/reliable-messaging';
import type {
  OperationAuditRecordInput,
  OperationAuditRepository,
} from '@memoflow/patterns/operations';
import { runTimelineQueryWithAudit } from '@memoflow/patterns/operations';
import type { ReminderTemplate } from '../domain/aggregates/reminder-template';
import { ReminderDomainService } from '../domain/services/reminder-domain-service';
import type { ReminderApplicationPort } from '../application';
import { ReminderTemplateClientMapper } from '../application/mappers/reminder-template-client.mapper';
import {
  ReminderGroupApplicationService,
  ReminderPreferencesApplicationService,
  ReminderScheduleQueryApplicationService,
  ReminderTemplateActionApplicationService,
} from '../application/services';
import { CreateReminderTemplateUseCase } from '../application/use-cases/commands/create-reminder-template.use-case';
import { UpdateReminderTemplateUseCase } from '../application/use-cases/commands/update-reminder-template.use-case';
import { DeleteReminderTemplateUseCase } from '../application/use-cases/commands/delete-reminder-template.use-case';
import { RecordReminderResponseUseCase } from '../application/use-cases/commands/record-reminder-response.use-case';
import { GetReminderTemplateUseCase } from '../application/use-cases/queries/get-reminder-template.use-case';
import { ListReminderTemplatesUseCase } from '../application/use-cases/queries/list-reminder-templates.use-case';
import { AnalyzeReminderFrequencyUseCase } from '../application/use-cases/queries/analyze-reminder-frequency.use-case';
import { AdjustReminderFrequencyUseCase } from '../application/use-cases/commands/adjust-reminder-frequency.use-case';
import { createLogger } from '@memoflow/utils/logger';

const logger = createLogger('ReminderModule');

export type ReminderRuntimeContributionsInput =
  ReminderModuleRuntimeContribution | readonly ReminderModuleRuntimeContribution[];

export interface ReminderModuleDependencies {
  readonly reminderTemplateRepository: IReminderTemplateRepository;
  readonly reminderGroupRepository: IReminderGroupRepository;
  readonly reminderResponseRepository: IReminderResponseRepository;
  readonly userReminderPreferenceRepository: IUserReminderPreferenceRepository;
  readonly routineProfileStore: RoutineProfileStore;
  readonly closureChecker: (identityId: string) => Promise<boolean>;
  readonly accountTimezonePort?: import('../domain/ports/account-timezone.port').AccountTimezonePort;
  readonly runtimeContributions?: ReminderRuntimeContributionsInput;
  /** Snooze command writer: persists canonical Routine temporary override state. */
  readonly snoozeOverrideWriter?: import('../application/use-cases/commands/record-reminder-response.use-case').ReminderSnoozeOverrideWriter;
  /** W7：可靠操作端口（timeline/replay 查询） */
  readonly reliablePort?: ReminderReliableOperationPort;
  /** W7：审计仓库（最小权限 + 审计） */
  readonly auditRepository?: OperationAuditRepository;
}

export interface ReminderModuleRuntimeContribution {
  start(): void | Promise<void>;
  stop(): void | Promise<void>;
  execute?(): Promise<void>;
}

export interface ReminderModuleInstance {
  readonly reminderTemplateRepository: IReminderTemplateRepository;
  readonly reminderGroupRepository: IReminderGroupRepository;
  readonly reminderResponseRepository: IReminderResponseRepository;
  readonly userReminderPreferenceRepository: IUserReminderPreferenceRepository;
  readonly routineProfileStore: RoutineProfileStore;
  readonly useCases: ReminderModuleUseCases;
  readonly api: ReminderApplicationPort;
  start(): void | Promise<void>;
  dispose(): void | Promise<void>;
}

export interface ReminderModuleUseCases {
  readonly createReminderTemplate: CreateReminderTemplateUseCase;
  readonly listReminderTemplates: ListReminderTemplatesUseCase;
  readonly getReminderTemplate: GetReminderTemplateUseCase;
  readonly updateReminderTemplate: UpdateReminderTemplateUseCase;
  readonly deleteReminderTemplate: DeleteReminderTemplateUseCase;
  readonly recordReminderResponse: RecordReminderResponseUseCase;
  readonly analyzeReminderFrequency: AnalyzeReminderFrequencyUseCase;
  readonly adjustReminderFrequency: AdjustReminderFrequencyUseCase;
}

export function createReminderUseCases(
  dependencies: ReminderModuleDependencies,
  options?: {
    reminderDomainService?: ReminderDomainService;
    templateMapper?: ReminderTemplateClientMapper;
  },
): ReminderModuleUseCases {
  if (!dependencies.closureChecker) {
    throw new Error('[FAIL-CLOSED] ReminderModule requires closureChecker dependency');
  }
  if (!dependencies.routineProfileStore) {
    throw new Error('[FAIL-CLOSED] ReminderModule requires routineProfileStore dependency');
  }

  const { reminderTemplateRepository, reminderGroupRepository, reminderResponseRepository } =
    dependencies;

  const reminderDomainService =
    options?.reminderDomainService ??
    new ReminderDomainService(
      reminderTemplateRepository,
      reminderGroupRepository,
      dependencies.userReminderPreferenceRepository,
      dependencies.routineProfileStore,
    );
  const templateMapper =
    options?.templateMapper ?? new ReminderTemplateClientMapper(reminderDomainService);

  return {
    createReminderTemplate: new CreateReminderTemplateUseCase(
      reminderTemplateRepository,
      reminderGroupRepository,
      reminderDomainService,
      templateMapper,
      dependencies.closureChecker,
    ),
    listReminderTemplates: new ListReminderTemplatesUseCase(
      reminderTemplateRepository,
      reminderGroupRepository,
      templateMapper,
    ),
    getReminderTemplate: new GetReminderTemplateUseCase(
      reminderTemplateRepository,
      reminderGroupRepository,
      templateMapper,
    ),
    updateReminderTemplate: new UpdateReminderTemplateUseCase(
      reminderTemplateRepository,
      reminderGroupRepository,
      reminderDomainService,
      templateMapper,
    ),
    deleteReminderTemplate: new DeleteReminderTemplateUseCase(
      reminderTemplateRepository,
      reminderDomainService,
    ),
    recordReminderResponse: new RecordReminderResponseUseCase(
      reminderResponseRepository,
      dependencies.snoozeOverrideWriter,
    ),
    analyzeReminderFrequency: new AnalyzeReminderFrequencyUseCase(
      reminderTemplateRepository,
      reminderResponseRepository,
    ),
    adjustReminderFrequency: new AdjustReminderFrequencyUseCase(reminderTemplateRepository),
  };
}

function normalizeRuntimeContributions(
  input?: ReminderRuntimeContributionsInput,
): readonly ReminderModuleRuntimeContribution[] {
  if (!input) return [];
  if (Array.isArray(input)) return Array.from(input);
  return [input as ReminderModuleRuntimeContribution];
}

async function getOwnedTemplateOrFail(
  reminderTemplateRepository: IReminderTemplateRepository,
  templateId: string,
  ctx: ExecutionContext,
  options?: Parameters<IReminderTemplateRepository['findByIdForIdentity']>[2],
): Promise<ReminderTemplate | null> {
  return reminderTemplateRepository.findByIdForIdentity(ctx.identityId, templateId, options);
}

export function createReminderModule(
  dependencies: ReminderModuleDependencies,
): ReminderModuleInstance {
  const {
    reminderTemplateRepository,
    reminderGroupRepository,
    reminderResponseRepository,
    userReminderPreferenceRepository,
    routineProfileStore,
  } = dependencies;

  const runtimeContributions = normalizeRuntimeContributions(dependencies.runtimeContributions);
  let started = false;

  const reminderDomainService = new ReminderDomainService(
    reminderTemplateRepository,
    reminderGroupRepository,
    userReminderPreferenceRepository,
    routineProfileStore,
  );
  const templateMapper = new ReminderTemplateClientMapper(reminderDomainService);
  const useCases = createReminderUseCases(dependencies, {
    reminderDomainService,
    templateMapper,
  });
  const reminderGroupApplicationService = new ReminderGroupApplicationService({
    reminderTemplateRepository,
    reminderGroupRepository,
    reminderDomainService,
  });
  const reminderPreferencesApplicationService = new ReminderPreferencesApplicationService({
    userReminderPreferenceRepository,
    reminderDomainService,
  });
  const reminderScheduleQueryApplicationService = new ReminderScheduleQueryApplicationService({
    reminderTemplateRepository,
    accountTimezonePort: dependencies.accountTimezonePort,
  });
  const reminderTemplateActionApplicationService = new ReminderTemplateActionApplicationService({
    reminderTemplateRepository,
    reminderDomainService,
    templateMapper,
  });

  const api: ReminderApplicationPort = {
    async createTemplate(data, ctx) {
      return useCases.createReminderTemplate.execute(data, ctx);
    },

    async listTemplates(ctx) {
      return useCases.listReminderTemplates.execute(undefined, ctx);
    },

    async getUpcomingReminders(params, ctx) {
      return reminderScheduleQueryApplicationService.getUpcomingReminders(params, ctx);
    },

    async getTodaySchedule(params, ctx) {
      return reminderScheduleQueryApplicationService.getTodaySchedule(params, ctx);
    },

    async getTemplate(id, ctx) {
      return useCases.getReminderTemplate.execute(id, ctx);
    },

    async updateTemplate(id, data, ctx) {
      return useCases.updateReminderTemplate.execute(id, data, ctx);
    },

    async deleteTemplate(id, ctx) {
      return useCases.deleteReminderTemplate.execute(id, ctx);
    },

    async enableTemplate(id, ctx) {
      return reminderTemplateActionApplicationService.enableTemplate(id, ctx);
    },

    async pauseTemplate(id, ctx) {
      return reminderTemplateActionApplicationService.pauseTemplate(id, ctx);
    },

    async toggleTemplate(id, ctx) {
      return reminderTemplateActionApplicationService.toggleTemplate(id, ctx);
    },

    async replaceTemplateProfiles(id, profileIds, ctx) {
      return reminderTemplateActionApplicationService.replaceTemplateProfiles(id, profileIds, ctx);
    },

    async getTemplateHistory(id, ctx) {
      return reminderTemplateActionApplicationService.getTemplateHistory(id, ctx);
    },

    async recordResponse(templateId, data, ctx) {
      return useCases.recordReminderResponse.execute({
        templateId,
        action: data.action as ReminderResponseAction,
        responseTime: data.responseTime,
        snoozeDurationSeconds: data.snoozeDurationSeconds,
        identityId: ctx.identityId,
      });
    },

    async getTemplateResponses(templateId, ctx) {
      const template = await getOwnedTemplateOrFail(reminderTemplateRepository, templateId, ctx);
      if (!template) {
        return fail({ code: 'NOT_FOUND', message: 'Template not found' });
      }
      return useCases.recordReminderResponse.getResponsesByTemplate(templateId, ctx.identityId);
    },

    async getResponseStats(templateId, ctx) {
      const template = await getOwnedTemplateOrFail(reminderTemplateRepository, templateId, ctx);
      if (!template) {
        return fail({ code: 'NOT_FOUND', message: 'Template not found' });
      }
      return useCases.recordReminderResponse.getResponseStats(templateId, ctx.identityId);
    },

    async analyzeFrequency(templateId, ctx) {
      const template = await getOwnedTemplateOrFail(reminderTemplateRepository, templateId, ctx);
      if (!template) {
        return fail({ code: 'NOT_FOUND', message: 'Template not found' });
      }
      return useCases.analyzeReminderFrequency.execute(templateId, ctx.identityId);
    },

    async adjustFrequency(templateId, data, ctx) {
      return useCases.adjustReminderFrequency.execute({
        templateId,
        newInterval: data.customInterval ?? 0,
        reason: data.action,
        identityId: ctx.identityId,
      });
    },

    async createGroup(data, ctx) {
      return reminderGroupApplicationService.createGroup(data, ctx);
    },

    async listGroups(ctx) {
      return reminderGroupApplicationService.listGroups(ctx);
    },

    async getGroup(id, ctx) {
      return reminderGroupApplicationService.getGroup(id, ctx);
    },

    async updateGroup(id, data, ctx) {
      return reminderGroupApplicationService.updateGroup(id, data, ctx);
    },

    async deleteGroup(id, ctx) {
      return reminderGroupApplicationService.deleteGroup(id, ctx);
    },

    async batchGroupTemplates(groupId, data, ctx) {
      return reminderGroupApplicationService.batchGroupTemplates(groupId, data, ctx);
    },

    async toggleGroup(id, ctx) {
      return reminderGroupApplicationService.toggleGroup(id, ctx);
    },

    async getPreferences(ctx) {
      return reminderPreferencesApplicationService.getPreferences(ctx);
    },

    async updatePreferences(data, ctx) {
      return reminderPreferencesApplicationService.updatePreferences(data, ctx);
    },

    async queryOperationTimeline(ctx) {
      if (!dependencies.reliablePort || !dependencies.auditRepository) {
        throw new Error(
          '[FAIL-CLOSED] reminder operation timeline requires explicit reliablePort and auditRepository dependencies (timeline_query audit is mandatory).',
        );
      }
      const { entries } = await runTimelineQueryWithAudit({
        repository: dependencies.auditRepository,
        source: 'reminder',
        actorIdentityId: ctx.identityId,
        filters: { limit: 100 },
        query: () => dependencies.reliablePort!.queryOperationTimeline(ctx.identityId),
      });
      return ok(entries);
    },

    async replayOperation(operationId, ctx) {
      if (!dependencies.reliablePort || !dependencies.auditRepository) {
        throw new Error(
          '[FAIL-CLOSED] reminder operation replay requires reliablePort and auditRepository dependencies.',
        );
      }
      try {
        const port = dependencies.reliablePort as unknown as {
          replayDeadLetterWithAudit?: (
            input: ReminderReplayDeadLetterInput,
            audit: OperationAuditRecordInput,
            auditRepository: OperationAuditRepository,
          ) => Promise<BusinessOperationReceipt>;
        };
        if (!port.replayDeadLetterWithAudit) {
          throw new Error(
            '[FAIL-CLOSED] reminder replay requires a port implementing atomic replayDeadLetterWithAudit (state + audit in one transaction).',
          );
        }
        const receipt = await port.replayDeadLetterWithAudit(
          { identityId: ctx.identityId, operationId },
          {
            actorIdentityId: ctx.identityId,
            source: 'reminder',
            operationId,
            action: 'replay',
          },
          dependencies.auditRepository,
        );
        return ok(receipt);
      } catch (err) {
        return fail({
          code: 'NOT_FOUND',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    },

    async getOperationAudit(ctx) {
      if (!dependencies.auditRepository) {
        throw new Error(
          '[FAIL-CLOSED] reminder operation audit requires an explicit auditRepository dependency.',
        );
      }
      return ok(await dependencies.auditRepository.listByActor({ identityId: ctx.identityId }));
    },
  };

  return {
    reminderTemplateRepository,
    reminderGroupRepository,
    reminderResponseRepository,
    userReminderPreferenceRepository,
    routineProfileStore,
    useCases,
    api,

    async start() {
      if (started) return;
      const startedContributions: ReminderModuleRuntimeContribution[] = [];
      for (const runtime of runtimeContributions) {
        try {
          await runtime.start();
          startedContributions.push(runtime);
        } catch (error) {
          // Partial-start rollback: await the already-started contributions in
          // REVERSE order (best-effort, logged), then rethrow the ORIGINAL
          // error. `started` stays false, so a later dispose() is a no-op —
          // start() owns its partial-start cleanup.
          for (const startedRuntime of [...startedContributions].reverse()) {
            try {
              await startedRuntime.stop();
            } catch (stopError) {
              logger.error(
                'ReminderModule: contribution stop failed during partial-start rollback',
                stopError,
              );
            }
          }
          throw error;
        }
      }
      started = true;
    },

    async dispose() {
      if (!started) return;
      for (const runtime of [...runtimeContributions].reverse()) {
        await runtime.stop();
      }
      started = false;
    },
  };
}
