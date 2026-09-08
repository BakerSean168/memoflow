import type { ReminderGroup } from '../aggregates/reminder-group';
import type { ReminderTemplate } from '../aggregates/reminder-template';
import type { RoutineProfileStore } from '../ports';
import {
  adaptLegacyReminderGroup,
  adaptLegacyReminderTemplate,
} from '../routine';

/**
 * Temporary migration bridge that keeps the canonical Routine vNext registry
 * live while the legacy Reminder persistence/API surface is being retired.
 *
 * Definition/profile projection is idempotent. Canonical membership writes are
 * owned directly by ReminderDomainService and are never synthesized from a
 * legacy single-group foreign key.
 */
export class LegacyRoutineCutoverService {
  constructor(private readonly store: RoutineProfileStore) {}

  async projectTemplateDefinition(template: ReminderTemplate): Promise<void> {
    const { routine } = adaptLegacyReminderTemplate({ template });
    await this.store.upsertDefinition(routine);
  }

  async projectProfile(group: ReminderGroup): Promise<void> {
    await this.store.upsertProfile(adaptLegacyReminderGroup(group));
  }

  async deleteRoutine(input: {
    readonly identityId: string;
    readonly routineId: string;
  }): Promise<void> {
    await this.store.deleteDefinition(input);
  }

  async deleteProfile(input: {
    readonly identityId: string;
    readonly profileId: string;
  }): Promise<void> {
    await this.store.deleteProfile(input);
  }
}
