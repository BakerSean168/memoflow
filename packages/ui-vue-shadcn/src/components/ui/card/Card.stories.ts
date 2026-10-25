import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '.';
import { Button } from '../button';
import { Input } from '../input';
import { Label } from '../label';

const meta = {
  title: 'Atoms/Card',
  component: Card,
  tags: ['autodocs'],
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => ({
    components: { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, Button },
    template: `
      <Card class="w-[350px]">
        <CardHeader>
          <CardTitle>Card Title</CardTitle>
          <CardDescription>Card description goes here.</CardDescription>
        </CardHeader>
        <CardContent>
          <p>Card content area.</p>
        </CardContent>
        <CardFooter class="flex justify-between">
          <Button variant="outline">Cancel</Button>
          <Button>Submit</Button>
        </CardFooter>
      </Card>
    `,
  }),
};

export const WithForm: Story = {
  render: () => ({
    components: {
      Card,
      CardHeader,
      CardTitle,
      CardDescription,
      CardContent,
      CardFooter,
      Button,
      Input,
      Label,
    },
    template: `
      <Card class="w-[350px]">
        <CardHeader>
          <CardTitle>Create project</CardTitle>
          <CardDescription>Deploy your new project in one-click.</CardDescription>
        </CardHeader>
        <CardContent>
          <div class="grid w-full items-center gap-4">
            <div class="flex flex-col space-y-1.5">
              <Label for="name">Name</Label>
              <Input id="name" placeholder="Name of your project" />
            </div>
          </div>
        </CardContent>
        <CardFooter class="flex justify-between">
          <Button variant="outline">Cancel</Button>
          <Button>Deploy</Button>
        </CardFooter>
      </Card>
    `,
  }),
};

export const SimpleContent: Story = {
  render: () => ({
    components: { Card, CardContent },
    template: `
      <Card class="w-[350px]">
        <CardContent class="pt-6">
          <p class="text-sm text-muted-foreground">Simple card with only content.</p>
        </CardContent>
      </Card>
    `,
  }),
};
