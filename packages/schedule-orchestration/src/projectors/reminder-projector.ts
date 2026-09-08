import type { SchedulingPort } from '@memoflow/contracts/schedule';
import type { ReminderScheduleProjectionSource } from '@memoflow/reminder/schedule-projection';

export interface ReminderProjector {
  upsertTemplate(templateId: string, identityId: string): Promise<void>;
  deleteTemplate(templateId: string, identityId: string): Promise<void>;
}

export interface CreateReminderProjectorDeps {
  readonly source: ReminderScheduleProjectionSource;
  readonly schedulingPort: SchedulingPort;
}

/** Reminder-owned desired scheduling set -> neutral SchedulingPort. */
export function createReminderProjector(deps: CreateReminderProjectorDeps): ReminderProjector {
  return {
    async upsertTemplate(templateId, identityId) {
      const plan = await deps.source.buildTemplatePlan(templateId, identityId);
      await deps.schedulingPort.reconcile(plan.owner, plan.desired);
    },

    async deleteTemplate(templateId, identityId) {
      await deps.schedulingPort.removeOwner(deps.source.buildTemplateOwner(templateId, identityId));
    },
  };
}
