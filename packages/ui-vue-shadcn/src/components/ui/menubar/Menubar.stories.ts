import type { Meta, StoryObj } from '@storybook/vue3-vite';
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
  MenubarCheckboxItem,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarGroup,
  MenubarLabel,
} from '.';

const meta = {
  title: 'Atoms/Menubar',
  component: Menubar,
  tags: ['autodocs'],
} satisfies Meta<typeof Menubar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => ({
    components: {
      Menubar,
      MenubarContent,
      MenubarItem,
      MenubarMenu,
      MenubarSeparator,
      MenubarShortcut,
      MenubarSub,
      MenubarSubContent,
      MenubarSubTrigger,
      MenubarTrigger,
      MenubarCheckboxItem,
      MenubarRadioGroup,
      MenubarRadioItem,
      MenubarGroup,
      MenubarLabel,
    },
    template: `
      <Menubar>
        <MenubarMenu>
          <MenubarTrigger>File</MenubarTrigger>
          <MenubarContent>
            <MenubarItem>New Tab <MenubarShortcut>⌘T</MenubarShortcut></MenubarItem>
            <MenubarItem>New Window <MenubarShortcut>⌘N</MenubarShortcut></MenubarItem>
            <MenubarSeparator />
            <MenubarSub>
              <MenubarSubTrigger>Share</MenubarSubTrigger>
              <MenubarSubContent>
                <MenubarItem>Email Link</MenubarItem>
                <MenubarItem>Messages</MenubarItem>
              </MenubarSubContent>
            </MenubarSub>
            <MenubarSeparator />
            <MenubarItem>Print... <MenubarShortcut>⌘P</MenubarShortcut></MenubarItem>
          </MenubarContent>
        </MenubarMenu>
        <MenubarMenu>
          <MenubarTrigger>Edit</MenubarTrigger>
          <MenubarContent>
            <MenubarItem>Undo <MenubarShortcut>⌘Z</MenubarShortcut></MenubarItem>
            <MenubarItem>Redo <MenubarShortcut>⇧⌘Z</MenubarShortcut></MenubarItem>
            <MenubarSeparator />
            <MenubarItem>Cut</MenubarItem>
            <MenubarItem>Copy</MenubarItem>
            <MenubarItem>Paste</MenubarItem>
          </MenubarContent>
        </MenubarMenu>
        <MenubarMenu>
          <MenubarTrigger>View</MenubarTrigger>
          <MenubarContent>
            <MenubarCheckboxItem :checked="true">Always Show Bookmarks Bar</MenubarCheckboxItem>
            <MenubarCheckboxItem>Always Show Full URLs</MenubarCheckboxItem>
            <MenubarSeparator />
            <MenubarItem>Reload <MenubarShortcut>⌘R</MenubarShortcut></MenubarItem>
            <MenubarItem>Force Reload <MenubarShortcut>⇧⌘R</MenubarShortcut></MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>
    `,
  }),
};
