import { mount } from '@vue/test-utils';
import { defineComponent, nextTick, ref } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';
import {
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Switch as RekaSwitch,
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@memoflow/ui-vue-shadcn';

const BooleanControlsHost = defineComponent({
  components: { Checkbox, RekaSwitch },
  setup() {
    return { checked: ref(false), switched: ref(false) };
  },
  template: `
    <Checkbox v-model="checked" aria-label="Toggle checkbox" />
    <RekaSwitch v-model="switched" aria-label="Toggle switch" />
    <output>{{ checked }}:{{ switched }}</output>
  `,
});

const DialogHost = defineComponent({
  components: {
    UiDialog: Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
    DialogTrigger,
  },
  setup() {
    return { open: ref(false) };
  },
  template: `
    <UiDialog v-model:open="open">
      <DialogTrigger>Open dialog</DialogTrigger>
      <DialogContent v-if="open">
        <DialogTitle>Dialog title</DialogTitle>
        <DialogDescription>Confirm the dialog action.</DialogDescription>
        <button type="button">Dialog action</button>
      </DialogContent>
    </UiDialog>
  `,
});

const DropdownHost = defineComponent({
  components: { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger },
  setup() {
    return { open: ref(false) };
  },
  template: `
    <DropdownMenu v-model:open="open">
      <DropdownMenuTrigger>Open menu</DropdownMenuTrigger>
      <DropdownMenuContent v-if="open">
        <DropdownMenuItem>First option</DropdownMenuItem>
        <DropdownMenuItem>Second option</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  `,
});

const PopoverHost = defineComponent({
  components: { Popover, PopoverContent, PopoverTrigger },
  setup() {
    return { open: ref(false) };
  },
  template: `
    <Popover v-model:open="open">
      <PopoverTrigger>Open popover</PopoverTrigger>
      <PopoverContent v-if="open">Popover content</PopoverContent>
    </Popover>
  `,
});

const TabsHost = defineComponent({
  components: { Tabs, TabsContent, TabsList, TabsTrigger },
  template: `
    <Tabs default-value="first">
      <TabsList>
        <TabsTrigger value="first">First tab</TabsTrigger>
        <TabsTrigger value="second">Second tab</TabsTrigger>
      </TabsList>
      <TabsContent value="first">First panel</TabsContent>
      <TabsContent value="second">Second panel</TabsContent>
    </Tabs>
  `,
});

describe('Reka primitive contracts', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('keeps Checkbox and Switch controlled state on the current modelValue contract', async () => {
    const wrapper = mount(BooleanControlsHost, { attachTo: document.body });

    await wrapper.get('[role="checkbox"]').trigger('click');
    await wrapper.get('[role="switch"]').trigger('click');
    await nextTick();

    expect(wrapper.get('output').text()).toBe('true:true');
    expect(wrapper.get('[role="checkbox"]').attributes('data-state')).toBe('checked');
    expect(wrapper.get('[role="switch"]').attributes('data-state')).toBe('checked');
    wrapper.unmount();
  });

  it('restores focus to the dialog trigger after Escape closes a mounted dialog', async () => {
    const wrapper = mount(DialogHost, { attachTo: document.body });
    const trigger = wrapper.get('button');

    await trigger.trigger('click');
    await nextTick();

    expect(document.body.textContent).toContain('Dialog title');

    await document
      .querySelector('[role="dialog"]')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await nextTick();

    expect(document.body.textContent).not.toContain('Dialog title');
    expect(document.activeElement).toBe(trigger.element);
    wrapper.unmount();
  });

  it('opens a dropdown with the keyboard and removes its options after Escape', async () => {
    const wrapper = mount(DropdownHost, { attachTo: document.body });
    const trigger = wrapper.get('button');

    trigger.element.focus();
    await trigger.trigger('keydown', { key: 'ArrowDown' });
    await nextTick();

    expect(document.body.textContent).toContain('First option');

    await document
      .querySelector('[role="menu"]')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await nextTick();

    expect(document.body.textContent).not.toContain('First option');
    wrapper.unmount();
  });

  it('removes dynamically mounted popover content after keyboard dismissal', async () => {
    const wrapper = mount(PopoverHost, { attachTo: document.body });
    const trigger = wrapper.get('button');

    trigger.element.focus();
    await trigger.trigger('click');
    await nextTick();
    expect(document.body.textContent).toContain('Popover content');

    await document
      .querySelector('[role="dialog"]')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await nextTick();

    expect(document.body.textContent).not.toContain('Popover content');
    expect(document.activeElement).toBe(trigger.element);
    wrapper.unmount();
  });

  it('activates a focused tab with Enter and replaces the visible panel', async () => {
    const wrapper = mount(TabsHost, { attachTo: document.body });
    const secondTab = wrapper.findAll('[role="tab"]')[1];

    secondTab.element.focus();
    await secondTab.trigger('keydown', { key: 'Enter' });
    await nextTick();

    expect(wrapper.get('[role="tab"][data-state="active"]').text()).toBe('Second tab');
    expect(wrapper.text()).toContain('Second panel');
    expect(wrapper.text()).not.toContain('First panel');
    wrapper.unmount();
  });
});

it('names the Sheet close control, preserves its target and dismisses the controlled root', async () => {
  const Host = defineComponent({
    components: { Sheet, SheetContent, SheetTitle, SheetDescription },
    setup: () => ({ open: ref(true) }),
    template: `<Sheet v-model:open="open"><SheetContent close-label="Dismiss catalog">
      <SheetTitle>Catalog</SheetTitle><SheetDescription>Choose a document</SheetDescription>
    </SheetContent></Sheet>`,
  });
  const wrapper = mount(Host, { attachTo: document.body });
  await nextTick();
  const close = document.querySelector<HTMLButtonElement>('[aria-label="Dismiss catalog"]')!;
  expect(close.tagName).toBe('BUTTON');
  expect(close.classList.contains('h-8')).toBe(true);
  expect(close.classList.contains('w-8')).toBe(true);
  close.click();
  await nextTick();
  expect(wrapper.vm.open).toBe(false);
  wrapper.unmount();
});
