import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { expect, userEvent, within } from 'storybook/test';
import { nextTick, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAppShellStore } from '@repository-ui-test-host/layouts/shell/useAppShellStore';
import { provideKnowledgeNativeSurface } from '@repository-ui-test-host/layouts/shell/useKnowledgeNativeSurface';
import KnowledgeCaptureReviewDialog from './KnowledgeCaptureReviewDialog.vue';
import type { KnowledgeCaptureSourceOption } from '../composables/knowledgeCaptureNativeEditSession';

type KnowledgeSurfaceHost = ReturnType<typeof provideKnowledgeNativeSurface>;

const localVaultSource: KnowledgeCaptureSourceOption = {
  key: 'local_vault',
  label: 'Research vault',
  source: { kind: 'local_vault' },
};

const repositorySource: KnowledgeCaptureSourceOption = {
  key: 'repository:connection-story-1',
  label: 'memoflow/architecture-notes',
  source: { kind: 'repository', connectionId: 'connection-story-1' },
};

type CaptureStoryParameters = {
  sourceOptions?: KnowledgeCaptureSourceOption[];
  prefilled?: boolean;
  busy?: boolean;
};

async function prepareReviewSession(
  parameters: CaptureStoryParameters,
  host: KnowledgeSurfaceHost,
) {
  await nextTick();
  const session = host?.locate();
  if (!session) return;
  if (parameters.prefilled) {
    session.patch({
      title: 'Guard rails for deep-work blocks',
      topic: 'Focus systems',
      targetSubpath: 'notes/guard-rails-for-deep-work.md',
      tags: ['focus', 'calendar', 'review'],
      markdown: [
        '# Guard rails for deep-work blocks',
        '',
        'Two uninterrupted blocks per working day work when the calendar protects',
        'the boundary and the weekly review closes the loop.',
        '',
        '- Default the afternoon block to review work, not new commitments.',
        '- Keep the weekly review short enough to actually happen.',
      ].join('\n'),
    });
  }
  session.coordinateSubmit(
    async () => {},
    async () => {},
  );
  if (parameters.busy) session.setEditingBlocked(true);
}

const meta = {
  title: 'Business/Repository/KnowledgeCaptureReviewDialog',
  component: KnowledgeCaptureReviewDialog,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  args: { open: true, sourceOptions: [localVaultSource, repositorySource] },
  render: (_args, { parameters }) => ({
    components: { KnowledgeCaptureReviewDialog },
    setup() {
      const open = ref(true);
      // The capture review registers itself against the shell's active business
      // tab. Seed that one shell fact so we can hand the real session an
      // interaction double without mounting the whole application shell.
      const router = useRouter();
      const store = useAppShellStore();
      const route = router.currentRoute.value.fullPath;
      store.tabs = [
        {
          id: 'story-knowledge-tab',
          module: 'note',
          route,
          title: 'Knowledge',
          titleKey: 'nav.capsule.note',
          titleSource: 'module',
          lastActiveAt: Date.now(),
        },
      ];
      store.activeTabId = 'story-knowledge-tab';
      store.panelSurface = 'business';
      // The dialog only registers its native edit session when the application
      // shell provides this key. Storybook has no shell, so the story owns the
      // same seam; otherwise prepopulation and the busy state silently no-op.
      const host = provideKnowledgeNativeSurface();
      onMounted(() => {
        void prepareReviewSession(parameters as CaptureStoryParameters, host);
      });
      return {
        open,
        sourceOptions: parameters.sourceOptions ?? [localVaultSource, repositorySource],
      };
    },
    template: `<div style="height: 1000px" data-testid="capture-review-story-surface">
      <KnowledgeCaptureReviewDialog
        v-model:open="open"
        :source-options="sourceOptions"
        default-source-key="local_vault"
      />
    </div>`,
  }),
} satisfies Meta<typeof KnowledgeCaptureReviewDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DraftReadyForReview: Story = {
  parameters: { prefilled: true },
};

export const BlankDraft: Story = {};

export const SourceUnavailable: Story = {
  parameters: { sourceOptions: [] },
};

export const Confirming: Story = {
  parameters: { prefilled: true, busy: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await expect(await canvas.findByTestId('knowledge-capture-native-confirm')).toBeDisabled();
    await expect(canvas.getByTestId('knowledge-capture-native-confirm')).toHaveTextContent(
      'Approving…',
    );
  },
};

export const LongMarkdownScrolls: Story = {
  parameters: { prefilled: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    const markdown = await canvas.findByTestId('knowledge-capture-native-markdown');
    await userEvent.click(markdown);
    await userEvent.keyboard('{Control>}{End}{/Control}');
    await expect(markdown).toBeVisible();
  },
};
