import type { Meta, StoryObj } from '@storybook/vue3-vite';
import {
  Pagination,
  PaginationEllipsis,
  PaginationFirst,
  PaginationLast,
  PaginationNext,
  PaginationPrev,
  PaginationList,
  PaginationListItem,
} from '.';
import { Button } from '../button';

const meta = {
  title: 'Atoms/Pagination',
  component: Pagination,
  tags: ['autodocs'],
  args: { itemsPerPage: 10 },
} satisfies Meta<typeof Pagination>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => ({
    components: {
      Pagination,
      PaginationEllipsis,
      PaginationFirst,
      PaginationLast,
      PaginationNext,
      PaginationPrev,
      PaginationList,
      PaginationListItem,
      Button,
    },
    template: `
      <Pagination :total="100" :sibling-count="1" show-edges :default-page="1">
        <PaginationList v-slot="{ items }" class="flex items-center gap-1">
          <PaginationFirst />
          <PaginationPrev />
          <template v-for="(item, index) in items" :key="index">
            <PaginationListItem v-if="item.type === 'page'" :value="item.value" as-child>
              <Button variant="outline" class="h-8 w-8 p-0">{{ item.value }}</Button>
            </PaginationListItem>
            <PaginationEllipsis v-else :index="index" />
          </template>
          <PaginationNext />
          <PaginationLast />
        </PaginationList>
      </Pagination>
    `,
  }),
};

export const Simple: Story = {
  render: () => ({
    components: {
      Pagination,
      PaginationNext,
      PaginationPrev,
      PaginationList,
      PaginationListItem,
      Button,
    },
    template: `
      <Pagination :total="30" :default-page="2">
        <PaginationList v-slot="{ items }" class="flex items-center gap-1">
          <PaginationPrev />
          <template v-for="(item, index) in items" :key="index">
            <PaginationListItem v-if="item.type === 'page'" :value="item.value" as-child>
              <Button variant="outline" class="h-8 w-8 p-0">{{ item.value }}</Button>
            </PaginationListItem>
          </template>
          <PaginationNext />
        </PaginationList>
      </Pagination>
    `,
  }),
};
