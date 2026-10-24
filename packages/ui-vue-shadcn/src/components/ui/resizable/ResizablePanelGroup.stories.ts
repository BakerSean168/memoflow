import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '.';

const meta = {
  title: 'Atoms/Resizable',
  component: ResizablePanelGroup,
  tags: ['autodocs'],
} as Meta<typeof ResizablePanelGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  ...({} as any),
  render: () => ({
    components: { ResizableHandle, ResizablePanel, ResizablePanelGroup },
    template: `
      <ResizablePanelGroup direction="horizontal" class="max-w-md rounded-lg border">
        <ResizablePanel :default-size="50">
          <div class="flex h-[200px] items-center justify-center p-6">
            <span class="font-semibold">Panel One</span>
          </div>
        </ResizablePanel>
        <ResizableHandle with-handle />
        <ResizablePanel :default-size="50">
          <div class="flex h-[200px] items-center justify-center p-6">
            <span class="font-semibold">Panel Two</span>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    `,
  }),
};

export const Vertical: Story = {
  ...({} as any),
  render: () => ({
    components: { ResizableHandle, ResizablePanel, ResizablePanelGroup },
    template: `
      <ResizablePanelGroup direction="vertical" class="max-w-md rounded-lg border">
        <ResizablePanel :default-size="30">
          <div class="flex h-full items-center justify-center p-6">
            <span class="font-semibold">Header</span>
          </div>
        </ResizablePanel>
        <ResizableHandle with-handle />
        <ResizablePanel :default-size="70">
          <div class="flex h-[200px] items-center justify-center p-6">
            <span class="font-semibold">Content</span>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    `,
  }),
};

export const ThreePanels: Story = {
  ...({} as any),
  render: () => ({
    components: { ResizableHandle, ResizablePanel, ResizablePanelGroup },
    template: `
      <ResizablePanelGroup direction="horizontal" class="max-w-lg rounded-lg border">
        <ResizablePanel :default-size="25">
          <div class="flex h-[200px] items-center justify-center p-6">
            <span class="font-semibold">Sidebar</span>
          </div>
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel :default-size="50">
          <div class="flex h-[200px] items-center justify-center p-6">
            <span class="font-semibold">Content</span>
          </div>
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel :default-size="25">
          <div class="flex h-[200px] items-center justify-center p-6">
            <span class="font-semibold">Panel</span>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    `,
  }),
};
