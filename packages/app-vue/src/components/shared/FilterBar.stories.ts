import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { Search } from '@lucide/vue';
import { Button, Input, Tabs, TabsList, TabsTrigger } from '@memoflow/ui-vue-shadcn';
import FilterBar from './FilterBar.vue';

const meta = {
  title: 'Business/AppVue/FilterBar',
  component: FilterBar,
  tags: ['autodocs'],
  render: () => ({
    components: { FilterBar, Button, Input, Tabs, TabsList, TabsTrigger, Search },
    template: `
      <div class="overflow-hidden rounded-xl border bg-background">
        <FilterBar>
          <template #tabs>
            <Tabs default-value="all">
              <TabsList class="h-8">
                <TabsTrigger value="all">All <span class="ml-1 text-xs text-muted-foreground">128</span></TabsTrigger>
                <TabsTrigger value="open">Open <span class="ml-1 text-xs text-muted-foreground">42</span></TabsTrigger>
                <TabsTrigger value="done">Completed <span class="ml-1 text-xs text-muted-foreground">74</span></TabsTrigger>
              </TabsList>
            </Tabs>
          </template>
          <template #filters>
            <Button variant="outline" size="sm">Priority</Button>
            <Button variant="outline" size="sm">Assignee</Button>
            <Button variant="outline" size="sm">Due date</Button>
          </template>
          <template #search>
            <div class="relative">
              <Search class="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input class="h-8 w-56 pl-7" placeholder="Search tasks" />
            </div>
          </template>
          <template #trailing>
            <Button size="sm" variant="ghost">View</Button>
          </template>
        </FilterBar>
        <div class="h-40 p-6 text-sm text-muted-foreground">List content below the filter row.</div>
      </div>
    `,
  }),
} satisfies Meta<typeof FilterBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};

export const SearchOnly: Story = {
  render: () => ({
    components: { FilterBar, Button, Input, Search },
    template: `
      <div class="overflow-hidden rounded-xl border bg-background">
        <FilterBar>
          <template #filters>
            <Button variant="outline" size="sm">Status</Button>
          </template>
          <template #search>
            <div class="relative">
              <Search class="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input class="h-8 w-56 pl-7" placeholder="Search notifications" />
            </div>
          </template>
        </FilterBar>
        <div class="h-40 p-6 text-sm text-muted-foreground">List content below the filter row.</div>
      </div>
    `,
  }),
};
