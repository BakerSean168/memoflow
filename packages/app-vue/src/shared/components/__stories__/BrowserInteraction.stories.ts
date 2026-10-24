import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import BrowserInteractionFixture from './BrowserInteractionFixture.vue';

/**
 * Real production components in isolated, inspectable Storybook states.
 * Browser tests run these stories via Vitest Browser Mode (Chromium/Playwright).
 * The separate focused Playwright tests retain strict CDP-native Tab semantics.
 *
 * The Storybook play API uses Testing Library userEvent, not vitest/browser.
 */
const meta = {
  title: 'Quality/Browser Interaction Contracts',
  component: BrowserInteractionFixture,
  tags: ['ci-interaction', 'ci-browser-interaction'],
  parameters: { layout: 'fullscreen' },
  args: { scenario: 'dialog' },
} satisfies Meta<typeof BrowserInteractionFixture>;

export default meta;
type Story = StoryObj<typeof meta>;

const bodyOf = (canvasElement: HTMLElement) => within(canvasElement.ownerDocument.body);

export const EditorDialog: Story = {
  name: 'Editor dialog: Tab cycle and Escape focus return',
  args: { scenario: 'dialog' },
  play: async ({ canvasElement }) => {
    const page = bodyOf(canvasElement);
    const opener = page.getByTestId('t3-open-editor');
    await userEvent.click(opener);
    const draft = await page.findByTestId('t3-draft');
    // Reka moves initial focus after mounting/entering the Portal.
    await waitFor(() => expect(draft).toHaveFocus());
    await userEvent.tab();
    await expect(page.getByTestId('t3-editor-next')).toHaveFocus();
    await userEvent.tab({ shift: true });
    await expect(draft).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    await expect(page.queryByTestId('t3-editor')).not.toBeInTheDocument();
    await waitFor(() => expect(opener).toHaveFocus());
  },
};

export const DateTimePickerDialog: Story = {
  name: 'Date/time picker: Tab is contained in dialog',
  args: { scenario: 'picker' },
  play: async ({ canvasElement }) => {
    const page = bodyOf(canvasElement);
    const opener = page.getByTestId('t3-open-picker');
    await userEvent.click(opener);
    const dialog = await page.findByTestId('t3-date-time-picker');
    await expect(dialog).toBeVisible();
    for (let i = 0; i < 8; i += 1) {
      await userEvent.tab();
      await expect(dialog.contains(canvasElement.ownerDocument.activeElement)).toBe(true);
    }
    await userEvent.keyboard('{Escape}');
    await expect(page.queryByTestId('t3-date-time-picker')).not.toBeInTheDocument();
    await expect(opener).toHaveFocus();
  },
};

export const NestedPanelPicker: Story = {
  name: 'Panel picker: editor becomes inert and recovers',
  args: { scenario: 'panel' },
  play: async ({ canvasElement }) => {
    const page = bodyOf(canvasElement);
    await userEvent.click(page.getByTestId('t3-open-editor'));
    const editor = await page.findByTestId('t3-editor');
    await userEvent.click(page.getByTestId('t3-open-picker'));
    await expect(await page.findByTestId('t3-date-time-picker')).toBeVisible();
    await expect(editor.parentElement).toHaveAttribute('inert');
    await userEvent.keyboard('{Escape}');
    await expect(page.queryByTestId('t3-date-time-picker')).not.toBeInTheDocument();
    await expect(editor.parentElement).not.toHaveAttribute('inert');
    await expect(page.getByTestId('t3-open-picker')).toHaveFocus();
  },
};

export const SingleSelectFilter: Story = {
  name: 'Filter dropdown: selection and focus return',
  args: { scenario: 'filter' },
  play: async ({ canvasElement }) => {
    const page = bodyOf(canvasElement);
    const opener = page.getByTestId('t3-filter');
    await userEvent.click(opener);
    const active = await page.findByRole('menuitemradio', { name: 'Active' });
    await userEvent.click(active);
    await expect(page.getByTestId('t3-filter-value')).toHaveTextContent('active');
    await userEvent.click(opener);
    await userEvent.keyboard('{Escape}');
    // Strict native focus restoration stays in Playwright. Storybook's
    // Testing Library userEvent.click() follows a different focus path.
  },
};

export const ModelPicker: Story = {
  name: 'AI model picker: keyboard selection and blocked model',
  args: { scenario: 'model' },
  play: async ({ canvasElement }) => {
    const page = bodyOf(canvasElement);
    await userEvent.click(page.getByTestId('ai-chat-model-selector'));
    const search = await page.findByTestId('ai-model-picker-search');
    await expect(search).toHaveFocus();
    await userEvent.type(search, 'Model');
    await expect(page.getAllByTestId('ai-model-picker-option')).toHaveLength(3);
    await expect(page.getByRole('button', { name: /Model Blocked/ })).toBeDisabled();
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    await expect(page.getByTestId('t3-model-selection')).toHaveTextContent('model-b');
  },
};

export const TaskRecurrence: Story = {
  name: 'Task recurrence: weekday Space and Enter',
  args: { scenario: 'recurrence' },
  play: async ({ canvasElement }) => {
    const page = bodyOf(canvasElement);
    await userEvent.click(page.getByTestId('t3-before-weekdays'));
    await userEvent.tab();
    const sunday = page.getByTestId('weekday-option-0');
    await expect(sunday).toHaveFocus();
    await userEvent.keyboard(' ');
    await expect(sunday).toHaveAttribute('aria-pressed', 'true');
    await userEvent.tab();
    const monday = page.getByTestId('weekday-option-1');
    await expect(monday).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(monday).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('t3-weekday-selection')).toHaveTextContent('0');
  },
};
