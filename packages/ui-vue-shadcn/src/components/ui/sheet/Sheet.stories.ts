import type { Meta, StoryObj } from '@storybook/vue3-vite';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '.';
import { Button } from '../button';

const meta = {
  title: 'Atoms/Sheet',
  component: Sheet,
  tags: ['autodocs'],
} satisfies Meta<typeof Sheet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => ({
    components: {
      Sheet,
      SheetClose,
      SheetContent,
      SheetDescription,
      SheetFooter,
      SheetHeader,
      SheetTitle,
      SheetTrigger,
      Button,
    },
    template: `
      <Sheet>
        <SheetTrigger as-child>
          <Button variant="outline">Open Sheet</Button>
        </SheetTrigger>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Edit Profile</SheetTitle>
            <SheetDescription>Make changes to your profile here. Click save when you're done.</SheetDescription>
          </SheetHeader>
          <div class="grid gap-4 py-4">
            <p class="text-sm text-muted-foreground">Sheet content goes here.</p>
          </div>
          <SheetFooter>
            <SheetClose as-child>
              <Button type="submit">Save changes</Button>
            </SheetClose>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    `,
  }),
};

export const LeftSide: Story = {
  render: () => ({
    components: {
      Sheet,
      SheetContent,
      SheetDescription,
      SheetHeader,
      SheetTitle,
      SheetTrigger,
      Button,
    },
    template: `
      <Sheet>
        <SheetTrigger as-child>
          <Button variant="outline">Open Left Sheet</Button>
        </SheetTrigger>
        <SheetContent side="left">
          <SheetHeader>
            <SheetTitle>Navigation</SheetTitle>
            <SheetDescription>Browse the application sections.</SheetDescription>
          </SheetHeader>
          <div class="py-4">
            <nav class="grid gap-2">
              <a href="#" class="text-sm hover:underline">Dashboard</a>
              <a href="#" class="text-sm hover:underline">Settings</a>
              <a href="#" class="text-sm hover:underline">Profile</a>
            </nav>
          </div>
        </SheetContent>
      </Sheet>
    `,
  }),
};
