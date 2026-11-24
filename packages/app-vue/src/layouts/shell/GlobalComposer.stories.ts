import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { provide, ref, shallowRef } from 'vue';
import { expect, within } from 'storybook/test';
import type { ChatModelOption } from '@memoflow/ai-ui/composables/types';
import { AIFooterComposer } from '@memoflow/ai-ui/components';
import GlobalComposer from './GlobalComposer.vue';
import { SHELL_COMPOSER_MOUNT_KEY } from '../../di/keys';

const models: ChatModelOption[] = [
  {
    key: 'agent:mastra-main::provider-demo-1::claude-sonnet-4.5',
    agentInstanceId: 'mastra-main',
    providerId: 'provider-demo-1',
    providerName: 'Anthropic',
    modelId: 'claude-sonnet-4.5',
    modelName: 'Claude Sonnet 4.5',
  },
];

const modelGroups = [{ providerId: 'provider-demo-1', providerName: 'Anthropic', models }];

/**
 * The shell renders only the host rectangle; the chat surface teleports its real
 * footer composer into it. The story mirrors that contract with the production
 * AIFooterComposer so the host is reviewed with genuine content dimensions.
 */
function renderComposer(options: {
  draft: string;
  density?: 'comfortable' | 'compact';
  width: string;
}) {
  return {
    components: { GlobalComposer, AIFooterComposer },
    setup() {
      const shellMount = shallowRef<HTMLElement | null>(null);
      provide(SHELL_COMPOSER_MOUNT_KEY, shellMount);
      const draft = ref(options.draft);
      return {
        shellMount,
        draft,
        footer: {
          loading: false,
          canSend: options.draft.length > 0,
          modelGroups,
          selectedModelKey: models[0]!.key,
          density: options.density ?? 'comfortable',
        },
      };
    },
    template: `
      <div class="min-h-[18rem] bg-background p-6">
        <div class="mx-auto ${options.width} overflow-hidden rounded-xl border border-border shadow-sm">
          <div class="flex h-[9rem] items-center justify-center border-b border-border/60 bg-muted/20 text-xs text-muted-foreground">
            Chat transcript (owned by the chat surface)
          </div>
          <GlobalComposer />
          <Teleport v-if="shellMount" :to="shellMount">
            <AIFooterComposer
              v-bind="footer"
              :model-value="draft"
              @update:model-value="draft = $event"
            />
          </Teleport>
        </div>
      </div>
    `,
  };
}

const meta = {
  title: 'Business/AppVue/GlobalComposer',
  component: GlobalComposer,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof GlobalComposer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Default wide column: the host reserves the bottom rectangle and receives the footer. */
export const Default: Story = {
  render: () =>
    renderComposer({
      draft: 'Summarize this week’s goal progress.',
      width: 'w-[48rem]',
    }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.getByTestId('global-composer')).toBeVisible();
    await expect(page.getByTestId('global-composer-mount')).toBeVisible();
    await expect(page.getByTestId('ai-footer-composer')).toBeVisible();
    await expect(page.getByTestId('ai-chat-composer')).toHaveValue(
      'Summarize this week’s goal progress.',
    );
  },
};

/** Compact density in a narrow column keeps a long draft inside the host rectangle. */
export const NarrowCompactColumn: Story = {
  render: () =>
    renderComposer({
      draft:
        'Draft a cross-workspace recap that mentions the quarterly planning review, the open knowledge capture and every task that moved today, without leaving the composer.',
      density: 'compact',
      width: 'w-[22rem]',
    }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.getByTestId('ai-footer-composer')).toBeVisible();
    await expect(page.getByTestId('ai-composer-footer-controls')).toBeVisible();
    const host = page.getByTestId('global-composer');
    const composer = page.getByTestId('ai-footer-composer');
    await expect(host.contains(composer)).toBe(true);
  },
};
