import type { ReminderGroup } from '../aggregates/reminder-group';
import type { ReminderTemplate } from '../aggregates/reminder-template';
import type { RoutineProfileStore } from '../ports';
import {
  ProfileMembership,
  adaptLegacyReminderGroup,
  adaptLegacyReminderTemplate,
} from '../routine';

/**
 * Temporary migration bridge that keeps the canonical Routine vNext registry
 * live while the legacy Reminder persistence/API surface is being retired.
 *
 * Definition/profile projection is idempotent. Membership replacement is only
 * invoked by legacy single-membership commands (create-with-group / move), so
 * ordinary Routine edits never collapse future M:N membership state.
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

  /**
   * Repairs an interrupted legacy create/replay without collapsing a newer M:N
   * membership set. A legacy group edge is only synthesized when the canonical
   * Routine currently has no memberships at all.
   */
  async healLegacyProjection(input: {
    readonly template: ReminderTemplate;
    readonly group: ReminderGroup | null;
  }): Promise<void> {
    const identityId = String(input.template.identityId);
    await this.projectTemplateDefinition(input.template);
    const existingMemberships = await this.store.listMembershipsForRoutine({
      identityId,
      routineId: input.template.id,
    });

    if (!input.group) return;
    if (String(input.group.identityId) !== identityId) {
      throw new TypeError('Legacy reminder membership ownership mismatch');
    }
    await this.projectProfile(input.group);
    if (existingMemberships.length > 0) return;

    await this.store.upsertMembership(
      ProfileMembership.create({
        identityId,
        profileId: input.group.id,
        routineId: input.template.id,
        enabled: true,
        now: new Date(input.template.updatedAt),
      }),
    );
  }

  async replaceLegacySingleMembership(input: {
    readonly template: ReminderTemplate;
    readonly group: ReminderGroup | null;
  }): Promise<void> {
    const identityId = String(input.template.identityId);
    await this.projectTemplateDefinition(input.template);

    if (!input.group) {
      await this.store.replaceRoutineMemberships({
        identityId,
        routineId: input.template.id,
        memberships: [],
      });
      return;
    }

    if (String(input.group.identityId) !== identityId) {
      throw new TypeError('Legacy reminder membership ownership mismatch');
    }
    await this.projectProfile(input.group);
    await this.store.replaceRoutineMemberships({
      identityId,
      routineId: input.template.id,
      memberships: [
        ProfileMembership.create({
          identityId,
          profileId: input.group.id,
          routineId: input.template.id,
          enabled: true,
          now: new Date(input.template.updatedAt),
        }),
      ],
    });
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
