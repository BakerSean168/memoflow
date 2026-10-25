import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { Toaster } from '.';
import { Button } from '../button';
import { toast } from 'vue-sonner';

const meta = {
  title: 'Atoms/Sonner',
  component: Toaster,
  tags: ['autodocs'],
} satisfies Meta<typeof Toaster>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => ({
    components: { Toaster, Button },
    setup() {
      const showToast = () => toast('Event has been created.');
      const showSuccess = () => toast.success('Profile updated successfully.');
      const showError = () => toast.error('Something went wrong.');
      const showDescription = () =>
        toast('Event created', { description: 'Monday, January 3rd at 6:00pm' });
      return { showToast, showSuccess, showError, showDescription };
    },
    template: `
      <div>
        <Toaster />
        <div class="flex flex-wrap gap-2">
          <Button variant="outline" @click="showToast">Default Toast</Button>
          <Button variant="outline" @click="showSuccess">Success</Button>
          <Button variant="outline" @click="showError">Error</Button>
          <Button variant="outline" @click="showDescription">With Description</Button>
        </div>
      </div>
    `,
  }),
};
