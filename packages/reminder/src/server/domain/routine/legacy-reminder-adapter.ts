import { ReminderStatus, ReminderType, TriggerType } from '@memoflow/contracts/reminder';
import { asInstant, type Instant } from '@memoflow/time';
import type { ReminderGroup } from '../aggregates/reminder-group';
import type { ReminderTemplate } from '../aggregates/reminder-template';
import { RoutineDefinition, RoutineProfile } from './model';
import {
  migrateLegacyFixedTimeTrigger,
  migrateLegacyIntervalTrigger,
  type RoutineTrigger,
} from './trigger';

/** Short-lived migration seam from legacy Reminder vocabulary to Routine truth. */
export function adaptLegacyReminderTemplate(input: { template: ReminderTemplate }): {
  routine: RoutineDefinition;
  /** Legacy elapsed anchor is runtime state, not long-lived Routine trigger config. */
  legacyRuntimeAnchor: Instant | null;
} {
  const { template } = input;
  const identityId = String(template.identityId);
  const triggerMigration = adaptLegacyReminderTrigger(template);
  const routine = RoutineDefinition.load({
    id: String(template.id),
    identityId,
    name: template.title,
    description: template.description,
    enabled: template.selfEnabled && template.status === ReminderStatus.Active,
    trigger: triggerMigration.trigger,
    version: template.version,
    createdAt: new Date(Number(template.createdAt)),
    updatedAt: new Date(Number(template.updatedAt)),
  });

  return {
    routine,
    legacyRuntimeAnchor: triggerMigration.legacyRuntimeAnchor,
  };
}

/** Maps one legacy ReminderGroup to the canonical RoutineProfile identity. */
export function adaptLegacyReminderGroup(group: ReminderGroup): RoutineProfile {
  return RoutineProfile.load({
    id: group.id,
    identityId: String(group.identityId),
    name: group.name,
    description: group.description,
    enabled: group.enabled,
    active: group.status === ReminderStatus.Active,
    version: group.version,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
  });
}

export interface LegacyReminderTriggerMigration {
  trigger: RoutineTrigger | null;
  legacyRuntimeAnchor: Instant | null;
  rationale: string;
}

/**
 * Maps only timing semantics the current legacy runtime actually owns.
 * Recurring FixedTime is daily in UpcomingReminderCalculationService; a
 * one-time Interval has no executable legacy path and is not invented here.
 */
export function adaptLegacyReminderTrigger(
  template: ReminderTemplate,
): LegacyReminderTriggerMigration {
  const trigger = template.trigger;
  const activatedAt = asInstant(Number(template.activeTime.activatedAt));

  if (trigger.type === TriggerType.FixedTime && trigger.fixedTime) {
    const timeZone = trigger.fixedTime.timezone ?? 'UTC';
    const startDate = ymdAtInstant(activatedAt, timeZone);
    return {
      trigger: migrateLegacyFixedTimeTrigger({
        legacy: trigger.fixedTime,
        recurrence: {
          startDate,
          frequency: 'daily',
          count: template.type === ReminderType.OneTime ? 1 : null,
        },
      }),
      legacyRuntimeAnchor: activatedAt,
      rationale:
        template.type === ReminderType.OneTime
          ? 'Legacy OneTime FixedTime maps to a single-count WallClock occurrence.'
          : 'Legacy Recurring FixedTime calculator repeats daily at the configured local time.',
    };
  }

  if (trigger.type === TriggerType.Interval && trigger.interval) {
    if (template.type === ReminderType.OneTime) {
      return {
        trigger: null,
        legacyRuntimeAnchor: activatedAt,
        rationale:
          'Legacy OneTime Interval has no executable calculator path; migration does not invent new behavior.',
      };
    }
    const migration = migrateLegacyIntervalTrigger(trigger.interval, {
      legacyAnchorInstant: activatedAt,
    });
    return {
      trigger: migration.trigger,
      legacyRuntimeAnchor: migration.legacyAnchorInstant,
      rationale: migration.rationale,
    };
  }

  return {
    trigger: null,
    legacyRuntimeAnchor: activatedAt,
    rationale: 'Legacy reminder has no recognized executable trigger shape.',
  };
}

function ymdAtInstant(instant: Instant, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(Number(instant)));
  const bag: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') bag[part.type] = part.value;
  }
  if (!bag.year || !bag.month || !bag.day) {
    throw new TypeError(`Could not derive legacy start date in time zone ${timeZone}`);
  }
  return `${bag.year}-${bag.month}-${bag.day}`;
}
