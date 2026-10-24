import type { Meta, StoryObj } from '@storybook/vue3-vite';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '.';

const meta = {
  title: 'Atoms/Command',
  component: Command,
  tags: ['autodocs'],
} satisfies Meta<typeof Command>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => ({
    components: {
      Command,
      CommandEmpty,
      CommandGroup,
      CommandInput,
      CommandItem,
      CommandList,
      CommandSeparator,
      CommandShortcut,
    },
    template: `
      <Command class="rounded-lg border shadow-md w-[350px]">
        <CommandInput placeholder="Type a command or search..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Suggestions">
            <CommandItem value="calendar">📅 Calendar</CommandItem>
            <CommandItem value="search">🔍 Search</CommandItem>
            <CommandItem value="calculator">🧮 Calculator</CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Settings">
            <CommandItem value="profile">👤 Profile <CommandShortcut>⌘P</CommandShortcut></CommandItem>
            <CommandItem value="billing">💳 Billing <CommandShortcut>⌘B</CommandShortcut></CommandItem>
            <CommandItem value="settings">⚙️ Settings <CommandShortcut>⌘S</CommandShortcut></CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    `,
  }),
};
