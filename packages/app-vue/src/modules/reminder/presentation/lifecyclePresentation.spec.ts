import { describe, expect, it } from 'vitest';
import { createI18n } from 'vue-i18n';
import type {
  ReminderGroupClientDTO,
  ReminderTemplateClientDTO,
} from '@memoflow/contracts/reminder';
import {
  getGlobalSwitchLabel,
  getGroupActiveStatusLabel,
  getGroupTemplateCountLabel,
  getProfileGateLabel,
  getProfileGateStateLabel,
  getProfileMembershipLabel,
  getProfilePolicyText,
  getProfileSidebarSummary,
  getTemplateEffectiveResultLabel,
  getTemplateEffectiveStatusLabel,
  getTemplateLifecycleBadgeText,
  getTemplateLifecycleSummary,
  getTemplateSelfSwitchLabel,
  getTemplateSelfSwitchShortLabel,
  getTemplateTriggerLabel,
  isProfileGateOpen,
} from './lifecycle-presentation';

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      reminder: {
        linear: {
          routineCountValue: '{count} routines',
          runningCountValue: '{count} running',
          sidebarGlobalPaused: '{count} routines paused by the master gate',
          sidebarProfilePaused: '{count} routines paused by this Profile gate',
        },
        lifecycle: {
          sourceGlobal: 'Paused by the Routine master gate',
          sourceProfile: 'Paused by the Profile gate; Routine state preserved',
          sourceRoutineInProfile: 'Routine-owned state inside a Profile',
          sourceRoutineWithoutProfile: 'Routine-owned state without a Profile',
          badgeGlobalPaused: 'Master gate closed',
          badgeProfilePaused: 'Profile gate closed',
          badgeRoutineOwned: 'Routine-owned',
          statusRunning: 'Running',
          statusPaused: 'Paused',
          resultRunningNow: 'Eligible to run',
          resultPausedNow: 'Not currently eligible',
          routineEnabledVerbose: 'Routine’s own switch is enabled',
          routinePausedVerbose: 'Routine’s own switch is paused',
          enabledShort: 'Enabled',
          pausedShort: 'Paused',
          globalPausedAll: 'Master gate closed for all Routines',
          noProfile: 'No Profile',
          profileGateOpen: 'Profile gate open',
          profileGateClosed: 'Profile gate closed',
          profilePolicyOpen:
            'This Profile allows its members to be evaluated. Each Routine keeps and applies its own switch.',
          profilePolicyClosed:
            'This Profile pauses member execution without changing any Routine’s own switch.',
        },
        templateDetail: {
          notConfigured: 'Not configured',
          triggerSummaryTime: 'At {time}',
          triggerSummaryInterval: 'Every {minutes} minutes',
        },
      },
    },
  },
});

const t = i18n.global.t;

function createTemplate(
  overrides: Partial<ReminderTemplateClientDTO> = {},
): ReminderTemplateClientDTO {
  return {
    id: 'routine-1' as ReminderTemplateClientDTO['id'],
    identityId: 'identity-1' as ReminderTemplateClientDTO['identityId'],
    name: 'Morning review',
    description: null,
    type: 'Recurring',
    trigger: {
      type: 'FixedTime',
      fixedTime: { time: '09:00', timezone: null },
      interval: null,
      displayText: 'At 09:00',
    },
    activeTime: { activatedAt: 0, displayText: 'Activated now' },
    activeHours: null,
    notificationConfig: {
      channels: ['Push'],
      title: null,
      body: null,
      sound: null,
      vibration: null,
      actions: null,
      channelsText: 'Push',
      hasSoundEnabled: false,
      hasVibrationEnabled: false,
    },
    selfEnabled: true,
    status: 'Active',
    effectiveEnabled: true,
    profileMemberships: [
      {
        profileId: 'profile-1' as ReminderTemplateClientDTO['profileMemberships'][number]['profileId'],
        profileName: 'Focus',
        enabled: true,
        profileEnabled: true,
        profileActive: true,
        effectiveEnabled: true,
      },
    ],
    importanceLevel: 'Moderate',
    tags: [],
    color: null,
    icon: null,
    nextTriggerAt: null,
    version: 1,
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
    history: null,
    displayTitle: 'Morning review',
    typeText: 'Recurring',
    triggerText: 'Every day',
    statusText: 'Active',
    importanceText: 'Moderate',
    nextTriggerText: null,
    isActive: true,
    isPaused: false,
    lastTriggeredText: null,
    lifecycleSource: 'profile',
    effectiveEnabledReason: 'Routine owns its switch.',
    globalReminderEnabled: true,
    ...overrides,
  } as ReminderTemplateClientDTO;
}

function createProfile(overrides: Partial<ReminderGroupClientDTO> = {}): ReminderGroupClientDTO {
  return {
    id: 'profile-1' as ReminderGroupClientDTO['id'],
    identityId: 'identity-1' as ReminderGroupClientDTO['identityId'],
    name: 'Focus',
    description: null,
    color: null,
    icon: null,
    // Compatibility metadata must not affect Profile gate presentation.
    enabled: true,
    status: 'Active',
    order: 0,
    stats: {
      totalTemplates: 2,
      activeTemplates: 1,
      pausedTemplates: 1,
      selfEnabledTemplates: 1,
      selfPausedTemplates: 1,
      templateCountText: '2 routines',
      activeStatusText: '1 running',
    },
    version: 1,
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
    displayName: 'Focus',
    statusText: 'Enabled',
    templateCountText: '2 routines',
    activeStatusText: '1 running',
    ...overrides,
  } as ReminderGroupClientDTO;
}

describe('lifecyclePresentation', () => {
  it('describes master, Profile, and Routine-owned lifecycle sources', () => {
    expect(getTemplateLifecycleSummary(t, createTemplate({ lifecycleSource: 'global' }))).toBe(
      'Paused by the Routine master gate',
    );
    expect(getTemplateLifecycleBadgeText(t, createTemplate({ lifecycleSource: 'global' }))).toBe(
      'Master gate closed',
    );
    expect(getTemplateLifecycleSummary(t, createTemplate({ lifecycleSource: 'profile' }))).toBe(
      'Paused by the Profile gate; Routine state preserved',
    );
    expect(getTemplateLifecycleBadgeText(t, createTemplate({ lifecycleSource: 'profile' }))).toBe(
      'Profile gate closed',
    );
    expect(
      getTemplateLifecycleSummary(
        t,
        createTemplate({ lifecycleSource: 'routine', profileMemberships: [] }),
      ),
    ).toBe('Routine-owned state without a Profile');
  });

  it('models a Profile as an explicit execution gate', () => {
    const open = createProfile();
    const closed = createProfile({ enabled: false, status: 'Paused' });

    expect(isProfileGateOpen(open)).toBe(true);
    expect(getProfileGateLabel(t, open)).toBe('Profile gate open');
    expect(getProfilePolicyText(t, open)).toBe(
      'This Profile allows its members to be evaluated. Each Routine keeps and applies its own switch.',
    );
    expect(isProfileGateOpen(closed)).toBe(false);
    expect(getProfileGateLabel(t, closed)).toBe('Profile gate closed');
    expect(getProfilePolicyText(t, closed)).toBe(
      'This Profile pauses member execution without changing any Routine’s own switch.',
    );
  });

  it('keeps Routine-owned state distinct from effective eligibility', () => {
    const pausedRoutine = createTemplate({
      effectiveEnabled: false,
      selfEnabled: false,
      globalReminderEnabled: false,
      profileMemberships: [],
      lifecycleSource: 'routine',
    });

    expect(getTemplateEffectiveStatusLabel(t, pausedRoutine)).toBe('Paused');
    expect(getTemplateEffectiveResultLabel(t, pausedRoutine)).toBe('Not currently eligible');
    expect(getTemplateSelfSwitchLabel(t, pausedRoutine)).toBe('Routine’s own switch is paused');
    expect(getTemplateSelfSwitchShortLabel(t, pausedRoutine)).toBe('Paused');
    expect(getGlobalSwitchLabel(t, pausedRoutine)).toBe('Master gate closed for all Routines');
    expect(getProfileMembershipLabel(t, pausedRoutine)).toBe('No Profile');
    expect(getProfileGateStateLabel(t, pausedRoutine)).toBe('No Profile');
  });

  it('formats Profile summaries, counts, and supported compatibility triggers', () => {
    const profile = createProfile();
    expect(getGroupTemplateCountLabel(t, profile)).toBe('2 routines');
    expect(getGroupActiveStatusLabel(t, profile)).toBe('1 running');
    expect(getTemplateTriggerLabel(t, createTemplate())).toBe('At 09:00');
    expect(
      getTemplateTriggerLabel(
        t,
        createTemplate({
          trigger: {
            type: 'Interval',
            fixedTime: null,
            interval: { minutes: 30, startTime: null },
          },
        }),
      ),
    ).toBe('Every 30 minutes');

    expect(
      getProfileSidebarSummary(t, profile, [
        createTemplate({
          id: 'global-paused' as ReminderTemplateClientDTO['id'],
          profileMemberships: [
            { profileId: profile.id as never, profileName: profile.name, enabled: true, profileEnabled: true, profileActive: true, effectiveEnabled: false },
          ],
          lifecycleSource: 'global',
          effectiveEnabled: false,
        }),
      ]),
    ).toBe('1 routines paused by the master gate');
    expect(
      getProfileSidebarSummary(t, profile, [
        createTemplate({
          id: 'profile-paused' as ReminderTemplateClientDTO['id'],
          profileMemberships: [
            { profileId: profile.id as never, profileName: profile.name, enabled: true, profileEnabled: false, profileActive: false, effectiveEnabled: false },
          ],
          lifecycleSource: 'profile',
          effectiveEnabled: false,
        }),
      ]),
    ).toBe('1 routines paused by this Profile gate');
  });
});
