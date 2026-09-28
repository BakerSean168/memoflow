import { defineComponent, ref } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { Dialog as AppDialog, DialogContent } from '@memoflow/ui-vue-shadcn';
import ProductDialogShell from './ProductDialogShell.vue';

describe('ProductDialogShell', () => {
  it('moves initial focus to the declared form control', async () => {
    const Host = defineComponent({
      components: { AppDialog, ProductDialogShell },
      template: `
        <AppDialog :open="true">
          <ProductDialogShell
            :open="true"
            test-id="focus-test-dialog"
            initial-focus-selector="[data-testid='initial-field']"
          >
            <template #title>Test form</template>
            <template #description>Focus contract</template>
            <button type="button">Focusable before the field</button>
            <input data-testid="initial-field" />
            <template #footer><button type="button">Save</button></template>
          </ProductDialogShell>
        </AppDialog>
      `,
    });

    const wrapper = mount(Host, { attachTo: document.body });
    await flushPromises();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    expect(document.activeElement).toBe(
      document.querySelector<HTMLElement>('[data-testid="initial-field"]'),
    );

    wrapper.unmount();
  });

  it('focuses the declared control when the dialog opens even without an auto-focus event', async () => {
    const Host = defineComponent({
      components: { AppDialog, ProductDialogShell },
      setup() {
        return { shellOpen: ref(false) };
      },
      template: `
        <AppDialog :open="true">
          <ProductDialogShell
            :open="shellOpen"
            test-id="open-state-focus-test-dialog"
            initial-focus-selector="[data-testid='open-state-initial-field']"
          >
            <template #title>Test form</template>
            <template #description>Open state focus contract</template>
            <button data-testid="focus-away" type="button">Focus away</button>
            <input data-testid="open-state-initial-field" />
            <template #footer><button type="button">Save</button></template>
          </ProductDialogShell>
        </AppDialog>
      `,
    });

    const wrapper = mount(Host, { attachTo: document.body });
    await flushPromises();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    const focusAway = document.querySelector<HTMLElement>('[data-testid="focus-away"]')!;
    focusAway.focus();
    expect(document.activeElement).toBe(focusAway);

    wrapper.vm.shellOpen = true;
    await flushPromises();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    expect(document.activeElement).toBe(
      document.querySelector<HTMLElement>('[data-testid="open-state-initial-field"]'),
    );

    wrapper.unmount();
  });
  it('supports a viewport-bounded workspace height without changing the default content mode', async () => {
    const WorkspaceHost = defineComponent({
      components: { AppDialog, ProductDialogShell },
      template: `
        <AppDialog :open="true">
          <ProductDialogShell
            :open="true"
            test-id="workspace-height-dialog"
            height-mode="workspace"
          >
            <template #title>Workspace form</template>
            <div>Body</div>
            <template #footer><button>Save</button></template>
          </ProductDialogShell>
        </AppDialog>
      `,
    });

    const workspaceWrapper = mount(WorkspaceHost, { attachTo: document.body });
    await flushPromises();

    const workspaceDialog = document.body.querySelector<HTMLElement>(
      '[data-testid="workspace-height-dialog"]',
    )!;
    const workspaceBody = workspaceDialog.querySelector<HTMLElement>(
      '[data-testid="product-dialog-body"]',
    )!;

    expect(workspaceDialog.classList.contains('h-[calc(100dvh-2rem)]')).toBe(true);
    expect(workspaceDialog.classList.contains('sm:h-[calc(100dvh-3rem)]')).toBe(true);
    expect(workspaceDialog.classList.contains('max-h-[1100px]')).toBe(true);
    expect(workspaceBody.classList.contains('flex-1')).toBe(true);
    expect(workspaceBody.classList.contains('overflow-y-auto')).toBe(true);
    workspaceWrapper.unmount();

    const ContentHost = defineComponent({
      components: { AppDialog, ProductDialogShell },
      template: `
        <AppDialog :open="true">
          <ProductDialogShell :open="true" test-id="content-height-dialog">
            <template #title>Compact form</template>
            <div>Body</div>
            <template #footer><button>Save</button></template>
          </ProductDialogShell>
        </AppDialog>
      `,
    });

    const contentWrapper = mount(ContentHost, { attachTo: document.body });
    await flushPromises();
    const contentDialog = document.body.querySelector<HTMLElement>(
      '[data-testid="content-height-dialog"]',
    )!;

    expect(contentDialog.classList.contains('max-h-[min(90vh,760px)]')).toBe(true);
    expect(contentDialog.classList.contains('h-[calc(100dvh-2rem)]')).toBe(false);
    contentWrapper.unmount();
  });

  it('renders reusable header actions separately from the title', async () => {
    const Host = defineComponent({
      components: { AppDialog, ProductDialogShell },
      template: `
        <AppDialog :open="true">
          <ProductDialogShell :open="true" test-id="header-actions-dialog">
            <template #title>Create goal</template>
            <template #description>Describe the goal</template>
            <template #actions><button data-testid="ai-action">Create with AI</button></template>
            <div>Body</div>
            <template #footer><button>Save</button></template>
          </ProductDialogShell>
        </AppDialog>
      `,
    });
    const wrapper = mount(Host, { attachTo: document.body });
    await flushPromises();
    expect(
      document.body.querySelector('[data-testid="product-dialog-header-actions"]'),
    ).not.toBeNull();
    expect(document.body.querySelector('[data-testid="ai-action"]')).not.toBeNull();
    wrapper.unmount();
  });

  it('does not reserve a description row when a dialog has no explanatory copy', async () => {
    const Host = defineComponent({
      components: { AppDialog, ProductDialogShell },
      template: `
        <AppDialog :open="true">
          <ProductDialogShell :open="true" test-id="title-only-dialog">
            <template #title>Create goal</template>
            <div>Body</div>
            <template #footer><button>Save</button></template>
          </ProductDialogShell>
        </AppDialog>
      `,
    });
    const wrapper = mount(Host, { attachTo: document.body });
    await flushPromises();
    expect(document.body.querySelector('[data-testid="product-dialog-description"]')).toBeNull();
    wrapper.unmount();
  });

  it('can preserve selection-style dialogs by preventing outside interaction', async () => {
    const Host = defineComponent({
      components: { AppDialog, ProductDialogShell },
      template: `
        <AppDialog :open="true">
          <ProductDialogShell
            :open="true"
            test-id="outside-lock-dialog"
            prevent-interact-outside
          >
            <template #title>Selection</template>
            <template #description>Choose one item</template>
            <div>Options</div>
            <template #footer><button type="button">Choose</button></template>
          </ProductDialogShell>
        </AppDialog>
      `,
    });

    const wrapper = mount(Host, { attachTo: document.body });
    await flushPromises();
    const content = wrapper.findComponent(DialogContent);
    const event = new Event('pointerdown', { cancelable: true });
    content.vm.$emit('interactOutside', event);

    expect(event.defaultPrevented).toBe(true);
    wrapper.unmount();
  });
});
