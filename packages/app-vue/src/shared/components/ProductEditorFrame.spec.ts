/** @vitest-environment happy-dom */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { enableAutoUnmount, flushPromises, mount, shallowMount } from '@vue/test-utils';
import { defineComponent, nextTick, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import { afterEach, describe, expect, it } from 'vitest';
import ProductEditorFrame from './ProductEditorFrame.vue';
import PaneScopedDialog from './PaneScopedDialog.vue';
import ProductDialogShell from './ProductDialogShell.vue';

enableAutoUnmount((unmount) => {
  afterEach(async () => {
    // Unmount Teleports before removing their target DOM, then let focus cleanup finish.
    unmount();
    await flushPromises();
    document.body.replaceChildren();
  });
});

const getSource = (path: string) => readFileSync(resolve(__dirname, path), 'utf8');

describe('ProductEditorFrame', () => {
  const props = { open: true, testId: 'sample-editor', titleId: 'sample-title' };

  it('renders business-pane editor, not the global Dialog, when the owner opts into panel', () => {
    const wrapper = shallowMount(ProductEditorFrame, {
      props: { ...props, presentation: 'panel' },
      slots: { title: 'Create item', default: 'Content', footer: 'Save' },
    });
    expect(wrapper.findComponent(PaneScopedDialog).exists()).toBe(true);
    expect(wrapper.findComponent(ProductDialogShell).exists()).toBe(false);
    expect(wrapper.findComponent(PaneScopedDialog).attributes('size')).toBe('wide');
  });

  it('preserves the legacy dialog entry for consumers not using the business workspace', () => {
    const wrapper = shallowMount(ProductEditorFrame, {
      props,
      slots: { title: 'Edit item', default: 'Content' },
      // The default shallow Dialog stub discards its slot. Use a passthrough
      // Dialog stub to exercise the actual legacy composition.
      global: {
        stubs: { Dialog: { template: '<div data-testid="legacy-dialog"><slot /></div>' } },
      },
    });
    expect(wrapper.findComponent(PaneScopedDialog).exists()).toBe(false);
    expect(wrapper.get('[data-testid="legacy-dialog"]').exists()).toBe(true);
    expect(wrapper.findComponent(ProductDialogShell).exists()).toBe(true);
  });

  const slots = {
    icon: '<span data-testid="editor-icon">Icon</span>',
    title: 'Edit item',
    description: 'Editor description',
    actions: '<button data-testid="header-action">More</button>',
    status: '<p data-testid="editor-status">Draft</p>',
    default: '<input data-testid="editor-input" />',
    footer: '<button data-testid="footer-action">Save</button>',
  };
  const global = () => ({
    plugins: [
      createI18n({ legacy: false, locale: 'en', messages: { en: { common: { close: 'Close' } } } }),
    ],
  });
  const settleFocus = async () => {
    await flushPromises();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await nextTick();
  };

  it.each([undefined, 'dialog', 'panel'] as const)(
    'renders the real header, body and footer for presentation %s',
    async (presentation) => {
      const wrapper = mount(ProductEditorFrame, {
        attachTo: document.body,
        props: { ...props, presentation },
        slots,
        global: global(),
      });
      await settleFocus();
      const dialog = document.querySelector<HTMLElement>('[data-testid="sample-editor"]')!;
      expect(dialog).not.toBeNull();
      expect(dialog.getAttribute('role')).toBe('dialog');
      expect(dialog.textContent).toContain('Edit item');
      expect(dialog.textContent).toContain('Editor description');
      expect(dialog.querySelector('[data-testid="header-action"]')).not.toBeNull();
      expect(dialog.querySelector('[data-testid="editor-status"]')).not.toBeNull();
      expect(dialog.querySelector('[data-testid="editor-input"]')).not.toBeNull();
      expect(dialog.querySelector('[data-testid="footer-action"]')).not.toBeNull();
      if (presentation === 'panel') {
        expect(dialog.getAttribute('aria-modal')).toBe('false');
        expect(wrapper.findComponent({ name: 'DialogRoot' }).exists()).toBe(false);
        expect(wrapper.element.contains(dialog)).toBe(true);
        expect(dialog.getAttribute('aria-labelledby')).toBe(props.titleId);
        expect(dialog.querySelector('header h2')?.id).toBe(props.titleId);
        expect(dialog.querySelector('footer [data-testid="footer-action"]')).not.toBeNull();
      } else {
        // Reka's modal behavior comes from DialogRoot; it does not render aria-modal.
        expect(wrapper.getComponent({ name: 'DialogRoot' }).props('modal')).toBe(true);
        expect(wrapper.element.contains(dialog)).toBe(false);
        expect(dialog.querySelector('[data-testid="product-dialog-footer"]')).not.toBeNull();
        expect(dialog.querySelector('[data-testid="editor-icon"]')).not.toBeNull();
        expect(
          dialog.querySelector('[data-testid="product-dialog-body"] [data-testid="editor-input"]'),
        ).not.toBeNull();
        expect(
          dialog.querySelector(
            '[data-testid="product-dialog-footer"] [data-testid="footer-action"]',
          ),
        ).not.toBeNull();
        expect(wrapper.findComponent(ProductDialogShell).props('recipe')).toBe('workspace');
      }
    },
  );

  it.each(['dialog', 'panel'] as const)(
    'preserves close requests and restores focus across repeated %s opens',
    async (presentation) => {
      const Host = defineComponent({
        components: { ProductEditorFrame },
        setup: () => ({ open: ref(false), presentation }),
        template: `<button data-testid="opener" @click="open = true">Open</button>
          <ProductEditorFrame v-model:open="open" :presentation="presentation"
            test-id="sample-editor" title-id="sample-title" initial-focus-selector="input">
            <template #title>Edit item</template><input />
            <template #footer><button>Save</button></template>
          </ProductEditorFrame>`,
      });
      const wrapper = mount(Host, { attachTo: document.body, global: global() });
      const opener = wrapper.get<HTMLButtonElement>('[data-testid="opener"]');
      for (let attempt = 0; attempt < 2; attempt++) {
        opener.element.focus();
        await opener.trigger('click');
        await settleFocus();
        const input = document.querySelector<HTMLInputElement>(
          '[data-testid="sample-editor"] input',
        )!;
        expect(input).not.toBeNull();
        expect(document.activeElement).toBe(input);
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await settleFocus();
        expect(wrapper.getComponent(ProductEditorFrame).emitted('update:open')).toEqual(
          Array.from({ length: attempt + 1 }, () => [false]),
        );
        expect(document.querySelector('[data-testid="sample-editor"]')).toBeNull();
        expect(document.activeElement).toBe(opener.element);
      }
    },
  );

  it.each(['dialog', 'panel'] as const)(
    'focuses an initially open %s and waits for its owner to accept closing before restoring focus',
    async (presentation) => {
      const opener = document.createElement('button');
      document.body.append(opener);
      opener.focus();
      const wrapper = mount(ProductEditorFrame, {
        attachTo: document.body,
        props: { ...props, presentation, initialFocusSelector: 'input' },
        slots,
        global: global(),
      });
      await settleFocus();
      const input = document.querySelector<HTMLInputElement>(
        '[data-testid="sample-editor"] input',
      )!;
      expect(input).not.toBeNull();
      expect(document.activeElement).toBe(input);
      if (presentation === 'panel') {
        await wrapper.get('header button[aria-label="Close"]').trigger('click');
      } else {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      }
      await settleFocus();
      expect(wrapper.emitted('update:open')).toEqual([[false]]);
      // The owner decides whether to accept the request; the frame stays open meanwhile.
      expect(document.querySelector('[data-testid="sample-editor"]')).not.toBeNull();
      expect(document.activeElement).toBe(input);
      await wrapper.setProps({ open: false });
      await settleFocus();
      expect(document.activeElement).toBe(opener);
    },
  );

  it('applies the explicit inert contract to the pane host while a nested picker owns the gesture', async () => {
    const isInert = (element: HTMLElement) =>
      element.hasAttribute('inert') || element.inert === true;
    const wrapper = mount(ProductEditorFrame, {
      attachTo: document.body,
      props: { ...props, presentation: 'panel', inert: true },
      slots,
      global: global(),
    });
    await settleFocus();
    const host = document.querySelector<HTMLElement>('[data-testid="pane-scoped-dialog-host"]')!;
    expect(host).not.toBeNull();
    expect(isInert(host)).toBe(true);
    await wrapper.setProps({ inert: false });
    await settleFocus();
    expect(isInert(host)).toBe(false);
  });

  it('keeps task, routine and schedule edits constrained to their owning pane', () => {
    for (const [owner, dialog] of [
      [
        '../../modules/task/views/TaskManagementView.vue',
        '../../modules/task/components/dialogs/TaskPlanDialog.vue',
      ],
      [
        '../../modules/routine/views/RoutineConfigurationView.vue',
        '../../modules/routine/components/RoutineEditorDialog.vue',
      ],
      [
        '../../modules/schedule/views/ScheduleCalendarView.vue',
        '../../modules/schedule/components/CreateScheduleDialog.vue',
      ],
    ]) {
      expect(getSource(owner)).toContain('presentation="panel"');
      expect(getSource(owner)).toContain('relative isolate');
      expect(getSource(owner)).toContain(':inert=');
      expect(getSource(dialog)).toContain('<ProductEditorFrame');
    }
    const pane = getSource('PaneScopedDialog.vue');
    expect(pane).toContain('aria-modal="false"');
    expect(pane).toContain('data-scroll-host="pane-dialog"');
    expect(pane).toContain('@keydown.esc.stop.prevent');
    expect(getSource('ProductEditorFrame.vue')).toContain('returnFocus');
  });

  it.each(['removed', 'closed'] as const)(
    'restores a visible owner control when its opener menu is %s',
    async (state) => {
      const fallback = document.createElement('button');
      fallback.dataset.testid = 'owner-control';
      const menuItem = document.createElement('button');
      const menu = document.createElement('div');
      menu.setAttribute('role', 'menu');
      menu.append(menuItem);
      document.body.append(fallback, menu);
      menuItem.focus();
      const wrapper = mount(ProductEditorFrame, {
        attachTo: document.body,
        props: {
          ...props,
          presentation: 'panel',
          returnFocusSelector: '[data-testid="owner-control"]',
          initialFocusSelector: 'input',
        },
        slots,
        global: global(),
      });
      await settleFocus();
      if (state === 'removed') menu.remove();
      else menu.dataset.state = 'closed';
      await wrapper.setProps({ open: false });
      await settleFocus();
      expect(document.activeElement).toBe(fallback);
    },
  );

  it('keeps a single 32px icon-only create affordance at all panel widths', () => {
    const create = getSource('ResponsivePrimaryAction.vue');
    expect(create).toContain('class="h-8 w-8');
    expect(create).toContain(':aria-label="label"');
    expect(create).not.toContain('@2xl/panel:inline');
    const routine = getSource('../../modules/routine/views/RoutineConfigurationView.vue');
    expect(routine).toContain('data-testid="routine-create-button"');
    expect(routine).toContain('size="icon"');
    expect(routine).not.toContain('hidden @2xl/panel:inline');
  });
});
