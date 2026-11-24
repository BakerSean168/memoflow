import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { expect, within } from 'storybook/test';
import AIMessageContent from './AIMessageContent.vue';

const richMarkdown = `## Weekly review

The plan is **on track** for this quarter. Three items need attention:

1. Close the remaining \`TaskPlan\` migration follow-ups.
2. Confirm the *Goal* target for Q4.
3. Link the review note back to the [planning goal](/goals/GoalId_550e8400-e29b-41d4-a716-446655440101).

> Keep the draft short; the native review owns the final wording.
`;

const longMarkdown = `### Workspace audit

The audit covered every surface that writes to the local Vault. The table below is the summary the team will review.

| Surface | Owner | Status |
| --- | --- | --- |
| Goal review | Goal module | Ready |
| Task planning | Task module | Ready |
| Knowledge capture | Repository module | Needs review |
| Routine upcoming | Routine module | Ready |

#### Follow-ups

- Verify the projection index before the next release.
- Keep the existing **local Vault** boundary; no editor copy is introduced.
- Re-run the reference journey after the migration.

\`\`\`ts
type CaptureReview = {
  documentId: string;
  projectionState: 'pending' | 'ready';
};

export function isReady(review: CaptureReview): boolean {
  return review.projectionState === 'ready';
}
\`\`\`

---

The remainder of the note records decision context, the reviewers involved, and the follow-up dates. It is intentionally long enough to exercise wrapping, list indentation, code scrolling, and table layout in the catalog.
`;

const meta = {
  title: 'Business/AI/AIMessageContent',
  component: AIMessageContent,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  decorators: [
    () => ({ template: '<div class="w-[46rem] max-w-full bg-background p-6"><story /></div>' }),
  ],
  args: { content: richMarkdown },
} satisfies Meta<typeof AIMessageContent>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Default assistant copy: headings, emphasis, ordered lists, inline code and a reference link. */
export const MarkdownText: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const content = await page.findByTestId('ai-message-markdown');
    await expect(content.querySelector('h2')).toHaveTextContent('Weekly review');
    await expect(content.querySelectorAll('li')).toHaveLength(3);
    await expect(content.querySelector('a')).toHaveAttribute(
      'href',
      '/goals/GoalId_550e8400-e29b-41d4-a716-446655440101',
    );
  },
};

/** Long output keeps tables, code blocks and nested lists readable without widening the message. */
export const LongContent: Story = {
  args: { content: longMarkdown },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const content = await page.findByTestId('ai-message-markdown');
    await expect(content.querySelector('table')).not.toBeNull();
    await expect(content.querySelector('pre code')).toBeVisible();
    await expect(content.querySelectorAll('table th')).toHaveLength(3);
  },
};

/** Muted text is the secondary voice (for example an inline reasoning note). */
export const Muted: Story = {
  args: {
    content:
      'This is a supporting note. It uses the muted foreground while keeping the same markdown spacing.',
    muted: true,
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.getByTestId('ai-message-markdown')).toHaveClass('text-muted-foreground');
  },
};

/** During generation the first chunk renders immediately; later chunks are throttled. */
export const Generating: Story = {
  args: {
    content: 'I am checking the workspace before writing the review.',
    generating: true,
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.getByTestId('ai-message-markdown')).toHaveTextContent(
      'I am checking the workspace',
    );
  },
};
