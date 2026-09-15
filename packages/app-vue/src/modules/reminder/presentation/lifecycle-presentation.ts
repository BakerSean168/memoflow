import type { ComposerTranslation } from 'vue-i18n';
import type {
  ReminderGroupClientDTO,
  ReminderTemplateClientDTO,
} from '@memoflow/contracts/reminder';
import { getProductTime, productTimeRevision } from '../../../shared/utils/product-time';

type Translate = ComposerTranslation;

export type ReminderScheduleState = 'upcoming' | 'missed' | 'paused' | 'failed' | 'unscheduled';

type ProfileGate = Pick<ReminderGroupClientDTO, 'enabled' | 'status'>;

export function isProfileGateOpen(profile: ProfileGate): boolean {
  return profile.enabled && profile.status === 'Active';
}

export function getTemplateLifecycleSummary(t: Translate, template: ReminderTemplateClientDTO) {
  if (template.lifecycleSource === 'global') return t('reminder.lifecycle.sourceGlobal');
  if (template.lifecycleSource === 'profile') return t('reminder.lifecycle.sourceProfile');
  return template.profileMemberships.length > 0
    ? t('reminder.lifecycle.sourceRoutineInProfile')
    : t('reminder.lifecycle.sourceRoutineWithoutProfile');
}

export function getTemplateLifecycleBadgeText(t: Translate, template: ReminderTemplateClientDTO) {
  if (template.lifecycleSource === 'global') return t('reminder.lifecycle.badgeGlobalPaused');
  if (template.lifecycleSource === 'profile') return t('reminder.lifecycle.badgeProfilePaused');
  return t('reminder.lifecycle.badgeRoutineOwned');
}

export function getTemplateEffectiveStatusLabel(t: Translate, template: ReminderTemplateClientDTO) {
  return template.effectiveEnabled
    ? t('reminder.lifecycle.statusRunning')
    : t('reminder.lifecycle.statusPaused');
}

export function getTemplateEffectiveResultLabel(t: Translate, template: ReminderTemplateClientDTO) {
  return template.effectiveEnabled
    ? t('reminder.lifecycle.resultRunningNow')
    : t('reminder.lifecycle.resultPausedNow');
}

export function getTemplateSelfSwitchLabel(t: Translate, template: ReminderTemplateClientDTO) {
  return template.selfEnabled
    ? t('reminder.lifecycle.routineEnabledVerbose')
    : t('reminder.lifecycle.routinePausedVerbose');
}

export function getTemplateSelfSwitchShortLabel(t: Translate, template: ReminderTemplateClientDTO) {
  return template.selfEnabled
    ? t('reminder.lifecycle.enabledShort')
    : t('reminder.lifecycle.pausedShort');
}

export function getGlobalSwitchLabel(t: Translate, template: ReminderTemplateClientDTO) {
  return template.globalReminderEnabled
    ? t('reminder.lifecycle.enabledShort')
    : t('reminder.lifecycle.globalPausedAll');
}

export function getProfileMembershipLabel(t: Translate, template: ReminderTemplateClientDTO) {
  if (template.profileMemberships.length === 0) return t('reminder.lifecycle.noProfile');
  return template.profileMemberships
    .map((membership) => membership.profileName ?? String(membership.profileId))
    .join(', ');
}

export function getProfileGateStateLabel(t: Translate, template: ReminderTemplateClientDTO) {
  if (template.profileMemberships.length === 0) return t('reminder.lifecycle.noProfile');
  const hasOpenPath = template.profileMemberships.some(
    (membership) => membership.enabled && membership.profileEnabled && membership.profileActive,
  );
  return hasOpenPath
    ? t('reminder.lifecycle.profileGateOpen')
    : t('reminder.lifecycle.profileGateClosed');
}

export function getProfileGateLabel(t: Translate, profile: ProfileGate) {
  return isProfileGateOpen(profile)
    ? t('reminder.lifecycle.profileGateOpen')
    : t('reminder.lifecycle.profileGateClosed');
}

export function getProfilePolicyText(t: Translate, profile: ProfileGate) {
  return isProfileGateOpen(profile)
    ? t('reminder.lifecycle.profilePolicyOpen')
    : t('reminder.lifecycle.profilePolicyClosed');
}

export function getGroupTemplateCountLabel(
  t: Translate,
  group: Pick<ReminderGroupClientDTO, 'stats'>,
) {
  return t('reminder.linear.routineCountValue', { count: group.stats.totalTemplates });
}

export function getGroupActiveStatusLabel(
  t: Translate,
  group: Pick<ReminderGroupClientDTO, 'stats'>,
) {
  return t('reminder.linear.runningCountValue', { count: group.stats.activeTemplates });
}

export function getTemplateTriggerLabel(t: Translate, template: ReminderTemplateClientDTO) {
  if (template.trigger?.fixedTime?.time) {
    return t('reminder.templateDetail.triggerSummaryTime', {
      time: template.trigger.fixedTime.time,
    });
  }
  if (template.trigger?.interval?.minutes) {
    return t('reminder.templateDetail.triggerSummaryInterval', {
      minutes: template.trigger.interval.minutes,
    });
  }
  return t('reminder.templateDetail.notConfigured');
}

export function getTemplateRecurrenceLabel(t: Translate, template: ReminderTemplateClientDTO) {
  if (template.type === 'OneTime') {
    return t('reminder.schedule.oneTime');
  }
  if (template.trigger.fixedTime) {
    return t('reminder.schedule.daily');
  }
  if (template.trigger.interval) {
    return t('reminder.schedule.everyMinutes', {
      minutes: template.trigger.interval.minutes,
    });
  }
  return t('reminder.schedule.notConfigured');
}

export function getTemplateNextTriggerLabel(
  t: Translate,
  template: ReminderTemplateClientDTO,
  locale: string,
) {
  if (template.nextTriggerAt === null) {
    return t('reminder.schedule.noNextTrigger');
  }

  void locale;
  void productTimeRevision.value;
  return getProductTime().format.dateTime(template.nextTriggerAt);
}

export function getTemplateScheduleState(
  template: ReminderTemplateClientDTO,
  now = Date.now(),
): ReminderScheduleState {
  if (!template.effectiveEnabled) {
    return 'paused';
  }

  const latestHistory = [...(template.history ?? [])]
    .filter((history) => history.deletedAt === null)
    .sort((left, right) => right.triggeredAt - left.triggeredAt)[0];
  if (latestHistory?.result === 'Failed') {
    return 'failed';
  }

  if (template.nextTriggerAt === null) {
    return 'unscheduled';
  }
  return template.nextTriggerAt < now ? 'missed' : 'upcoming';
}

export function getTemplateScheduleStateLabel(
  t: Translate,
  template: ReminderTemplateClientDTO,
  now = Date.now(),
) {
  return t(`reminder.schedule.state.${getTemplateScheduleState(template, now)}`);
}

export function getProfileSidebarSummary(
  t: Translate,
  profile: Pick<ReminderGroupClientDTO, 'id' | 'enabled' | 'status'>,
  routines: Array<
    Pick<ReminderTemplateClientDTO, 'profileMemberships' | 'lifecycleSource' | 'effectiveEnabled'>
  >,
) {
  const scopedRoutines = routines.filter((routine) =>
    routine.profileMemberships.some(
      (membership) => String(membership.profileId) === String(profile.id),
    ),
  );
  const pausedByGlobal = scopedRoutines.filter(
    (routine) => routine.lifecycleSource === 'global',
  ).length;
  const pausedByProfile = scopedRoutines.filter(
    (routine) => routine.lifecycleSource === 'profile' && !routine.effectiveEnabled,
  ).length;

  if (pausedByGlobal > 0) {
    return t('reminder.linear.sidebarGlobalPaused', { count: pausedByGlobal });
  }
  if (pausedByProfile > 0) {
    return t('reminder.linear.sidebarProfilePaused', { count: pausedByProfile });
  }
  return getProfilePolicyText(t, profile);
}
