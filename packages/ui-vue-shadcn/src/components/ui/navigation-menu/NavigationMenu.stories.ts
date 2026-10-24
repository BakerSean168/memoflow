import type { Meta, StoryObj } from '@storybook/vue3-vite';
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  NavigationMenuViewport,
} from '.';

const meta = {
  title: 'Atoms/NavigationMenu',
  component: NavigationMenu,
  tags: ['autodocs'],
} satisfies Meta<typeof NavigationMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => ({
    components: {
      NavigationMenu,
      NavigationMenuContent,
      NavigationMenuItem,
      NavigationMenuLink,
      NavigationMenuList,
      NavigationMenuTrigger,
      NavigationMenuViewport,
    },
    template: `
      <NavigationMenu>
        <NavigationMenuList>
          <NavigationMenuItem>
            <NavigationMenuTrigger>Getting Started</NavigationMenuTrigger>
            <NavigationMenuContent>
              <ul class="grid gap-3 p-4 w-[400px]">
                <li><NavigationMenuLink href="#">Introduction</NavigationMenuLink></li>
                <li><NavigationMenuLink href="#">Installation</NavigationMenuLink></li>
                <li><NavigationMenuLink href="#">Typography</NavigationMenuLink></li>
              </ul>
            </NavigationMenuContent>
          </NavigationMenuItem>
          <NavigationMenuItem>
            <NavigationMenuTrigger>Components</NavigationMenuTrigger>
            <NavigationMenuContent>
              <ul class="grid gap-3 p-4 w-[400px]">
                <li><NavigationMenuLink href="#">Alert Dialog</NavigationMenuLink></li>
                <li><NavigationMenuLink href="#">Hover Card</NavigationMenuLink></li>
                <li><NavigationMenuLink href="#">Progress</NavigationMenuLink></li>
              </ul>
            </NavigationMenuContent>
          </NavigationMenuItem>
          <NavigationMenuItem>
            <NavigationMenuLink href="#">Documentation</NavigationMenuLink>
          </NavigationMenuItem>
        </NavigationMenuList>
      </NavigationMenu>
    `,
  }),
};
