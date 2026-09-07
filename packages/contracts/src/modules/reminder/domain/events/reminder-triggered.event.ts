import type { IdentityId, ReminderTemplateId } from '../../../../primitives';
import type { ReminderTemplateServerDTO } from '../../aggregates/reminder-template-server';

export interface ReminderTriggeredEvent {
  identityId: IdentityId;
  templateId: ReminderTemplateId;
  triggeredAt: number;
  nextTriggerAt: number | null;
  reminder: ReminderTemplateServerDTO;
}
