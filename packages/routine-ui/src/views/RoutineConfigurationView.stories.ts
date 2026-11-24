import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { provide } from 'vue';
import type { RoutineConfigurationSnapshot } from '@memoflow/routine-contracts';
import type { RoutineClientPort } from '@memoflow/routine-client';
import { routineUiHost } from '../routine-ui-host';
import RoutineConfigurationView from './RoutineConfigurationView.vue';

const createdAt = '2026-10-01T08:00:00.000Z';
const updatedAt = '2026-11-19T18:30:00.000Z';

const populatedSnapshot: RoutineConfigurationSnapshot = {
  definitions: [
    {
      id: 'routine-story-1',
      name: 'Stand and move',
      description: 'Leave the desk for a short walk before the next deep-work block.',
      enabled: true,
      version: 2,
      createdAt,
      updatedAt,
      trigger: {
        type: 'Elapsed',
        timingOwner: 'scheduler',
        durationMs: 50 * 60_000,
        anchor: 'last-satisfied',
      },
    },
    {
      id: 'routine-story-2',
      name: '20-20-20 eye break',
      description: null,
      enabled: true,
      version: 1,
      createdAt,
      updatedAt,
      trigger: {
        type: 'ActiveUsage',
        timingOwner: 'local-runtime',
        requiredActiveMs: 20 * 60_000,
        anchor: 'profile-activation',
        naturalBreakCredit: { idleDurationMs: 5 * 60_000, effect: 'satisfy-and-reset' },
        protocolBreakCredit: { kind: 'Eye', minimumBreakMs: 20_000 },
      },
    },
    {
      id: 'routine-story-3',
      name: 'Drink water',
      description: 'A full glass, not a sip.',
      enabled: false,
      version: 4,
      createdAt,
      updatedAt,
      trigger: {
        type: 'WallClock',
        timingOwner: 'scheduler',
        localTime: '15:00',
        timeZone: 'Asia/Shanghai',
        recurrence: {
          startDate: '2026-10-01',
          frequency: 'daily',
          interval: 1,
          byWeekday: [],
          count: null,
          until: null,
        },
      },
    },
  ] as RoutineConfigurationSnapshot['definitions'],
  profiles: [
    {
      id: 'profile-story-1',
      name: 'Focus days',
      description: 'Weekday deep-work blocks.',
      enabled: true,
      active: true,
      version: 3,
      createdAt,
      updatedAt,
    },
    {
      id: 'profile-story-2',
      name: 'Weekend reset',
      description: 'Short reset sessions on Saturday and Sunday.',
      enabled: false,
      active: false,
      version: 1,
      createdAt,
      updatedAt,
    },
  ] as RoutineConfigurationSnapshot['profiles'],
  memberships: [
    { routineId: 'routine-story-1', profileId: 'profile-story-1', enabled: true, version: 1 },
    { routineId: 'routine-story-2', profileId: 'profile-story-1', enabled: true, version: 1 },
    { routineId: 'routine-story-3', profileId: 'profile-story-2', enabled: true, version: 1 },
  ],
  preferences: { globalEnabled: true, version: 5 },
  runtimeContext: { activeProfileIds: ['profile-story-1'] },
  capabilities: { localRuntime: true },
  overrides: [
    {
      routineId: 'routine-story-1',
      snoozeUntil: Date.now() + 30 * 60_000,
      suppressUntil: null,
      overrideIntervalMs: null,
      expiresAt: Date.now() + 30 * 60_000,
      reason: 'In a customer call',
      source: 'user',
    },
  ],
};

const emptySnapshot: RoutineConfigurationSnapshot = {
  definitions: [],
  profiles: [],
  memberships: [],
  preferences: { globalEnabled: true, version: 0 },
  runtimeContext: { activeProfileIds: [] },
  capabilities: { localRuntime: true },
  overrides: [],
};

type RoutineStoryParameters = {
  snapshot?: RoutineConfigurationSnapshot;
  fail?: boolean;
};

function installRoutinePort(parameters: RoutineStoryParameters) {
  provide(routineUiHost.ROUTINE_SERVICE_KEY, {
    getConfigurationSnapshot: async () =>
      parameters.fail
        ? { ok: false, error: { code: 'OFFLINE', message: 'Routine owner is offline' } }
        : { ok: true, data: parameters.snapshot ?? populatedSnapshot },
  } as unknown as RoutineClientPort);
}

const meta = {
  title: 'Business/Routine/RoutineConfigurationView',
  component: RoutineConfigurationView,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  render: (_args, { parameters }) => ({
    components: { RoutineConfigurationView },
    setup() {
      installRoutinePort(parameters);
      return {};
    },
    template: `<div style="height: 980px" data-testid="routine-config-story-surface">
      <RoutineConfigurationView />
    </div>`,
  }),
} satisfies Meta<typeof RoutineConfigurationView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ConfiguredRoutines: Story = {};

export const EmptyConfiguration: Story = {
  parameters: { snapshot: emptySnapshot },
};

export const GloballyPaused: Story = {
  parameters: {
    snapshot: {
      ...populatedSnapshot,
      preferences: { globalEnabled: false, version: 6 },
    },
  },
};

export const WebWithoutLocalRuntime: Story = {
  parameters: {
    snapshot: { ...populatedSnapshot, capabilities: { localRuntime: false } },
  },
};

export const LoadFailure: Story = {
  parameters: { fail: true },
};
