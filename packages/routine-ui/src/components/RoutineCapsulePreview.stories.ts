import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { provide } from 'vue';
import type { RoutineUpcomingOccurrence } from '@memoflow/routine-contracts';
import { ROUTINE_SERVICE_KEY } from '../../../app-vue/src/di/keys';
import type { IRoutineService } from '../../../app-vue/src/di/types';
import RoutineCapsulePreview from './RoutineCapsulePreview.vue';

type CapsuleStoryParameters = {
  mode?: 'ready' | 'empty' | 'error' | 'loading';
};

const now = Date.now();
const inMinutes = (minutes: number) => now + minutes * 60_000;

const occurrences: RoutineUpcomingOccurrence[] = [
  {
    identityId: 'identity-story',
    routineId: 'routine-story-1',
    occurrenceKey: 'routine-story-1:stand',
    title: 'Stand and move',
    description: 'Leave the desk for a short walk before the next block.',
    occurrenceAt: inMinutes(12),
    timingStatus: 'scheduled',
    endAt: null,
    revision: 2,
    editable: false,
  },
  {
    identityId: 'identity-story',
    routineId: 'routine-story-2',
    occurrenceKey: 'routine-story-2:eyes',
    title: '20-20-20 eye break',
    description: null,
    occurrenceAt: inMinutes(24),
    intervalMs: 20 * 60_000,
    timingStatus: 'scheduled',
    endAt: null,
    revision: 1,
    editable: false,
  },
  {
    identityId: 'identity-story',
    routineId: 'routine-story-3',
    occurrenceKey: 'routine-story-3:water',
    title: 'Drink water',
    description: 'A full glass, not a sip.',
    occurrenceAt: now - 60_000,
    timingStatus: 'awaiting-completion',
    endAt: null,
    revision: 4,
    editable: false,
  },
];

function installCapsulePort(parameters: CapsuleStoryParameters) {
  const mode = parameters.mode ?? 'ready';
  provide(ROUTINE_SERVICE_KEY, {
    getUpcomingOccurrences: async () => {
      if (mode === 'loading') return new Promise(() => {});
      if (mode === 'error')
        return { ok: false, error: { code: 'OFFLINE', message: 'Routine service is offline' } };
      if (mode === 'empty') return { ok: true, data: { occurrences: [] } };
      return { ok: true, data: { occurrences } };
    },
    setTemporaryOverride: async () => ({ ok: true, data: {} }),
  } as unknown as IRoutineService);
}

const meta = {
  title: 'Business/Routine/RoutineCapsulePreview',
  component: RoutineCapsulePreview,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  render: (_args, { parameters }) => ({
    components: { RoutineCapsulePreview },
    setup() {
      installCapsulePort(parameters);
      return {};
    },
    template: `<div style="height: 420px; width: 380px; padding: 24px" data-testid="routine-capsule-story-surface">
      <RoutineCapsulePreview />
    </div>`,
  }),
} satisfies Meta<typeof RoutineCapsulePreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const UpcomingToday: Story = {};

export const EmptyToday: Story = {
  parameters: { mode: 'empty' },
};

export const LoadFailure: Story = {
  parameters: { mode: 'error' },
};

export const LoadingSkeleton: Story = {
  parameters: { mode: 'loading' },
};
