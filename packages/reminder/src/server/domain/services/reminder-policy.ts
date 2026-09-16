import { ReminderStatus } from '@memoflow/contracts/reminder';
import { BusinessRuleViolationError } from '@memoflow/utils/errors';
import type { ReminderGroup } from '../aggregates/reminder-group';
import type { ReminderTemplate } from '../aggregates/reminder-template';
import { evaluateRoutineEligibility } from '../routine';

/** Legacy policy facade over canonical Routine effective-state truth. */
export class ReminderPolicy {
  public calculateEffectiveEnabled(
    template: ReminderTemplate,
    group: ReminderGroup | null,
  ): boolean {
    return evaluateRoutineEligibility({
      routineEnabled: template.selfEnabled && template.status === ReminderStatus.Active,
      profileEnabled: group?.enabled,
      membershipEnabled: true,
      temporaryOverrideAllowsExecution: true,
    }).eligible;
  }

  public assertValidGroupAssignment(template: ReminderTemplate, group: ReminderGroup | null): void {
    if (!group) return;
    if (group.identityId !== template.identityId) {
      throw new BusinessRuleViolationError(
        'Reminder template and group must belong to the same identity.',
      );
    }
  }

  public assertTemplateDeletable(template: ReminderTemplate, hardDelete: boolean): void {
    if (!hardDelete && template.deletedAt) {
      throw new BusinessRuleViolationError('Reminder template is already deleted.');
    }
  }

  public assertCanTrigger(template: ReminderTemplate, group: ReminderGroup | null): void {
    if (!this.calculateEffectiveEnabled(template, group)) {
      throw new BusinessRuleViolationError('Reminder template is not enabled.');
    }
  }
}
