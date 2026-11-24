import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { screen, userEvent, waitFor } from 'storybook/test';
import AgentInstanceWizard from './AgentInstanceWizard.vue';

const meta = {
  title: 'Business/Setting/AgentInstanceWizard',
  component: AgentInstanceWizard,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  args: {
    open: true,
    native: true,
    existingSlugs: [],
    busy: false,
    error: false,
  },
} satisfies Meta<typeof AgentInstanceWizard>;

export default meta;
type Story = StoryObj<typeof meta>;

async function continueToIdentity() {
  await userEvent.click(await screen.findByTestId('ai-instance-continue'));
  await screen.findByTestId('ai-instance-name');
}

/** Step 1: pick the agent that backs the instance. */
export const AgentStep: Story = {};

/** Step 2: display name, slug and accent color. */
export const IdentityStep: Story = {
  play: async () => {
    await continueToIdentity();
  },
};

/** Step 3 for a native CLI: executable and home directory paths. */
export const NativeConfigStep: Story = {
  play: async () => {
    await userEvent.click(await screen.findByTestId('ai-provider-catalog-codex'));
    await continueToIdentity();
    await userEvent.click(screen.getByTestId('ai-instance-continue'));
    await screen.findByTestId('ai-instance-executable');
  },
};

/** A slug already used by another instance blocks the step with inline validation. */
export const DuplicateSlug: Story = {
  args: { existingSlugs: ['mastra'] },
  play: async () => {
    await continueToIdentity();
    const slug = screen.getByTestId('ai-instance-slug');
    await userEvent.clear(slug);
    await userEvent.type(slug, 'mastra');
    await userEvent.click(screen.getByRole('button', { name: 'Config' }));
    await waitFor(() => {
      const field = screen.getByTestId('ai-instance-slug');
      if (field.getAttribute('aria-invalid') !== 'true') throw new Error('not invalid yet');
    });
  },
};

/** Save failed after the user submitted the instance; the wizard stays open. */
export const SaveError: Story = {
  args: { error: true },
  play: async () => {
    await userEvent.click(await screen.findByTestId('ai-provider-catalog-codex'));
    await continueToIdentity();
    await userEvent.click(screen.getByTestId('ai-instance-continue'));
    await screen.findByText('Unable to save Agent instance');
  },
};
