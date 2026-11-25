import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { expect, within } from 'storybook/test';
import ReleaseNotes from './ReleaseNotes.vue';

/**
 * Representative Markdown changelog: multiple heading levels, ordered and
 * unordered lists, inline code, a fenced block, a quote and an external link.
 * No desktop bridge is provided, so the link only renders and never opens.
 */
const withContent = [
  '# MemoFlow 1.8',
  '',
  'A focused release for the resident desktop shell.',
  '',
  '## Highlights',
  '',
  '- **Faster shell startup** with lazily mounted business panels',
  '- A readable `ReleaseNotes` renderer for long changelogs',
  '- See the [release guide](https://example.com/changelog) for the full list',
  '',
  '### Keyboard',
  '',
  '1. Press `?` to open the shortcut help',
  '2. Use `J` / `K` to move through a list',
  '3. Press `Enter` to open the active item',
  '',
  '> Desktop window controls stay in the title bar.',
  '',
  '```ts',
  'const app = createMemoFlow({ resident: true });',
  '```',
].join('\n');

const meta = {
  title: 'Business/AppVue/ReleaseNotes',
  component: ReleaseNotes,
  tags: ['autodocs'],
  args: { source: withContent },
  render: (args) => ({
    components: { ReleaseNotes },
    setup: () => ({ args }),
    template: `
      <div class="w-[36rem] rounded-xl border bg-background p-6">
        <ReleaseNotes v-bind="args" />
      </div>
    `,
  }),
} satisfies Meta<typeof ReleaseNotes>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Full Markdown changelog rendered through the safe release-notes pipeline. */
export const WithContent: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await expect(page.getByRole('heading', { level: 1 })).toHaveTextContent('MemoFlow 1.8');
    await expect(page.getByRole('heading', { level: 2 })).toHaveTextContent('Highlights');
    await expect(page.getByRole('link', { name: 'release guide' })).toHaveAttribute(
      'href',
      'https://example.com/changelog',
    );
    await expect(page.getByRole('link', { name: 'release guide' })).toHaveAttribute(
      'rel',
      'noopener noreferrer',
    );
    await expect(page.getByText(/createMemoFlow/)).toBeInTheDocument();
  },
};

/** An empty release body renders nothing instead of a blank styled block. */
export const Empty: Story = {
  args: { source: '' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await expect(page.queryByRole('heading')).not.toBeInTheDocument();
    await expect(page.queryByRole('link')).not.toBeInTheDocument();
  },
};
