import type { ReminderEventMap } from '@memoflow/contracts/reminder';
import type { ScheduledIntent, SchedulingOwner } from '@memoflow/contracts/schedule';
import { buildSchedulingKey } from '@memoflow/contracts/schedule';
import type { IReminderTemplateRepository } from '../domain/repositories/i-reminder-template-repository';
import type { IUserReminderPreferenceRepository } from '../domain/repositories/i-user-reminder-preference-repository';
import type { RoutineProfileStore } from '../domain/ports';
import { ReminderTemplateControlService } from '../domain/services/reminder-template-control-service';

export const REMINDER_TEMPLATE_HANDLER_KEY = 'reminder.template.fire';
export const REMINDER_TEMPLATE_PAYLOAD_VERSION = 1;
export const REMINDER_SCHEDULING_OWNER_TYPE = 'reminder.template';

export interface ReminderTemplateScheduledPayload {
  readonly templateId: string;
  readonly scheduledFor: number;
}

export interface ReminderScheduleProjectionPlan {
  readonly owner: SchedulingOwner;
  readonly desired: readonly ScheduledIntent<ReminderTemplateScheduledPayload>[];
}

export interface ReminderScheduleProjectionSource {
  buildTemplatePlan(
    templateId: string,
    identityId: string,
  ): Promise<ReminderScheduleProjectionPlan>;
  buildTemplateOwner(templateId: string, identityId: string): SchedulingOwner;
  /** Full authority scan used by startup reconcile / lost-event repair. */
  listTemplateRefs(): Promise<Array<{ templateId: string; identityId: string }>>;
}

export interface ReminderScheduleProjectionHandlers {
  upsertTemplate(templateId: string, identityId: string): Promise<void>;
  deleteTemplate(templateId: string, identityId: string): Promise<void>;
}

export type ReminderScheduleProjectionEventMap = Pick<
  ReminderEventMap,
  | 'reminder:template-created'
  | 'reminder:template-updated'
  | 'reminder:template-enabled'
  | 'reminder:template-paused'
  | 'reminder:template-deleted'
  | 'reminder:template-eligibility-changed'
  | 'reminder:triggered'
>;

function reminderOwner(templateId: string, identityId: string): SchedulingOwner {
  return { identityId, type: REMINDER_SCHEDULING_OWNER_TYPE, id: templateId };
}

export function createReminderScheduleProjectionSource(deps: {
  reminderTemplateRepository: IReminderTemplateRepository;
  routineProfileStore: RoutineProfileStore;
  userReminderPreferenceRepository?: IUserReminderPreferenceRepository;
}): ReminderScheduleProjectionSource {
  const controlService = new ReminderTemplateControlService(
    deps.reminderTemplateRepository,
    deps.userReminderPreferenceRepository,
    deps.routineProfileStore,
  );

  return {
    buildTemplateOwner(templateId, identityId) {
      return reminderOwner(templateId, identityId);
    },

    async listTemplateRefs() {
      const refs = await deps.reminderTemplateRepository.findAllTemplateRefs();
      return refs.map((ref) => ({ templateId: ref.id, identityId: ref.identityId }));
    },

    async buildTemplatePlan(templateId, identityId) {
      const owner = reminderOwner(templateId, identityId);
      const template = await deps.reminderTemplateRepository.findByIdForIdentity(
        identityId,
        templateId,
      );

      if (!template) {
        return { owner, desired: [] };
      }

      const canonicalOwner = reminderOwner(template.id, String(template.identityId));
      const effectiveStatus = await controlService.calculateEffectiveStatus(template);
      if (template.deletedAt || !effectiveStatus.isEffectivelyEnabled || !template.nextTriggerAt) {
        return { owner: canonicalOwner, desired: [] };
      }

      const scheduledFor = template.nextTriggerAt;
      const schedulingKey = buildSchedulingKey(
        'reminder.template',
        template.id,
        String(scheduledFor),
      );
      const intent: ScheduledIntent<ReminderTemplateScheduledPayload> = {
        schedulingKey,
        handlerKey: REMINDER_TEMPLATE_HANDLER_KEY,
        runAt: scheduledFor,
        payloadVersion: REMINDER_TEMPLATE_PAYLOAD_VERSION,
        payload: {
          templateId: template.id,
          scheduledFor,
        },
        sourceRevision: template.version,
        priority: 'normal',
        timeoutMs: null,
        observability: {
          name: template.title,
          tags: ['reminder', `template:${template.id}`],
        },
      };

      return { owner: canonicalOwner, desired: [intent] };
    },
  };
}

export function createReminderScheduleProjectionEventHandlers(
  handlers: ReminderScheduleProjectionHandlers,
): {
  [K in keyof ReminderScheduleProjectionEventMap]: (
    event: ReminderScheduleProjectionEventMap[K],
  ) => Promise<void>;
} {
  return {
    'reminder:template-created': async (event) =>
      handlers.upsertTemplate(event.templateId, String(event.identityId)),
    'reminder:template-updated': async (event) =>
      handlers.upsertTemplate(event.templateId, String(event.identityId)),
    'reminder:template-enabled': async (event) =>
      handlers.upsertTemplate(event.templateId, String(event.identityId)),
    'reminder:template-paused': async (event) =>
      handlers.deleteTemplate(event.templateId, String(event.identityId)),
    'reminder:template-deleted': async (event) =>
      handlers.deleteTemplate(event.templateId, String(event.identityId)),
    'reminder:template-eligibility-changed': async (event) =>
      handlers.upsertTemplate(event.templateId, String(event.identityId)),
    // Trigger state is committed before this event is published. Re-read the
    // aggregate and arm the next occurrence from its canonical nextTriggerAt.
    'reminder:triggered': async (event) =>
      handlers.upsertTemplate(event.templateId, String(event.identityId)),
  };
}
