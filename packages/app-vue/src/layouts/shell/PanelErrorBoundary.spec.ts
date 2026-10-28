import { describe, expect, it } from 'vitest';
import {
  defineComponent,
  h,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  type Component,
  type Ref,
} from 'vue';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import PanelErrorBoundary from './PanelErrorBoundary.vue';

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      common: {
        unknownError: 'Unknown error',
        retry: 'Retry',
        viewErrorDetails: 'View error details',
      },
      shell: {
        panel: {
          contentErrorTitle: 'This panel ran into a problem',
          contentErrorDescription: 'This business panel failed to render.',
        },
      },
    },
  },
});

const Healthy = defineComponent({
  setup() {
    return () => h('div', { 'data-testid': 'panel-ok' }, 'ok');
  },
});

let draftInstanceSeq = 0;

interface DraftHarness {
  /** 有状态草稿面板，带唯一实例 ID、挂载/卸载计数与可读写草稿值。 */
  Draft: Component;
  mountIds: string[];
  unmountIds: string[];
  /** 最近一次 setup 创建的实例 ID（跨重建保持最新值）。 */
  instanceId: Ref<string | null>;
  readDraft: () => string | null;
  writeDraft: (value: string) => void;
}

/**
 * 模拟被路由的业务草稿面板：实例身份、生命周期计数和草稿状态都通过闭包
 * 暴露给用例，用来区分「错误/重试保留实例」与「父级 resetKey 显式重建」。
 */
function createDraftHarness(): DraftHarness {
  const mountIds: string[] = [];
  const unmountIds: string[] = [];
  const instanceId = ref<string | null>(null);
  let liveDraft: Ref<string> | null = null;

  const Draft = defineComponent({
    name: 'StatefulDraftPanel',
    setup() {
      const id = `draft-${++draftInstanceSeq}`;
      const draft = ref('');
      liveDraft = draft;
      instanceId.value = id;
      onMounted(() => {
        mountIds.push(id);
      });
      onUnmounted(() => {
        unmountIds.push(id);
      });
      return { id, draft };
    },
    template: `
      <div data-testid="draft-panel" :data-instance-id="id">
        <textarea data-testid="draft-input" v-model="draft" />
      </div>
    `,
  });

  return {
    Draft,
    mountIds,
    unmountIds,
    instanceId,
    readDraft: () => liveDraft?.value ?? null,
    writeDraft: (value: string) => {
      if (liveDraft) {
        liveDraft.value = value;
      }
    },
  };
}

describe('PanelErrorBoundary (V2 S5 cleanup)', () => {
  it('renders children when healthy', () => {
    const wrapper = mount(PanelErrorBoundary, {
      global: { plugins: [i18n] },
      slots: { default: () => h(Healthy) },
    });

    expect(wrapper.get('[data-testid="panel-ok"]').text()).toBe('ok');
    expect(wrapper.find('[data-testid="panel-error-fallback"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="panel-error-content"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('shows fallback UI when an error is reported and hides content', async () => {
    const wrapper = mount(PanelErrorBoundary, {
      global: { plugins: [i18n] },
      slots: { default: () => h(Healthy) },
    });

    const vm = wrapper.vm as unknown as {
      reportError: (err: unknown) => void;
      error: { value: Error | null };
    };
    vm.reportError(new Error('panel boom'));
    await nextTick();

    expect(wrapper.find('[data-testid="panel-error-fallback"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="panel-error-fallback"]').text()).toContain(
      'This panel ran into a problem',
    );
    expect(wrapper.get('[data-testid="panel-error-fallback"]').text()).toContain('panel boom');
    expect(wrapper.find('[data-testid="panel-ok"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="panel-error-content"]').attributes('style')).toContain(
      'display: none',
    );
    wrapper.unmount();
  });

  it('retry clears the error without unmounting the routed draft subtree', async () => {
    const wrapper = mount(PanelErrorBoundary, {
      global: { plugins: [i18n] },
      slots: { default: () => h(Healthy) },
    });

    const vm = wrapper.vm as unknown as {
      reportError: (err: unknown) => void;
      handleRetry: () => void;
      contentKey: number;
    };

    vm.reportError(new Error('panel boom'));
    await nextTick();
    const keyBefore = Number(vm.contentKey);
    expect(wrapper.find('[data-testid="panel-error-fallback"]').exists()).toBe(true);

    await wrapper.get('[data-testid="panel-error-retry"]').trigger('click');
    await nextTick();

    expect(wrapper.find('[data-testid="panel-error-fallback"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="panel-ok"]').text()).toBe('ok');
    expect(Number(vm.contentKey)).toBe(keyBefore + 1);
    wrapper.unmount();
  });

  it('keeps the same stateful draft instance and its content across error and retry', async () => {
    const harness = createDraftHarness();
    const wrapper = mount(PanelErrorBoundary, {
      global: { plugins: [i18n] },
      slots: { default: () => h(harness.Draft) },
    });

    const vm = wrapper.vm as unknown as {
      reportError: (err: unknown) => void;
    };

    harness.writeDraft('half-written memo');
    await nextTick();

    const instanceBefore = harness.instanceId.value;
    expect(instanceBefore).not.toBeNull();
    expect(harness.mountIds).toEqual([instanceBefore]);
    expect(harness.unmountIds).toEqual([]);
    expect(harness.readDraft()).toBe('half-written memo');

    vm.reportError(new Error('panel boom'));
    await nextTick();

    expect(wrapper.find('[data-testid="panel-error-fallback"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="panel-error-content"]').attributes('style')).toContain(
      'display: none',
    );
    expect(harness.unmountIds).toEqual([]);
    expect(harness.mountIds).toEqual([instanceBefore]);
    expect(harness.instanceId.value).toBe(instanceBefore);
    expect(wrapper.get('[data-testid="draft-panel"]').attributes('data-instance-id')).toBe(
      instanceBefore,
    );
    expect(harness.readDraft()).toBe('half-written memo');

    await wrapper.get('[data-testid="panel-error-retry"]').trigger('click');
    await nextTick();

    expect(wrapper.find('[data-testid="panel-error-fallback"]').exists()).toBe(false);
    expect(
      wrapper.get('[data-testid="panel-error-content"]').attributes('style') ?? '',
    ).not.toContain('display: none');
    expect(harness.instanceId.value).toBe(instanceBefore);
    expect(harness.mountIds).toEqual([instanceBefore]);
    expect(harness.unmountIds).toEqual([]);
    expect(harness.readDraft()).toBe('half-written memo');
    expect((wrapper.get('[data-testid="draft-input"]').element as HTMLTextAreaElement).value).toBe(
      'half-written memo',
    );
    wrapper.unmount();
  });

  it('confines error and retry to the failing panel without disturbing a sibling panel', async () => {
    const failing = createDraftHarness();
    const sibling = createDraftHarness();

    const Host = defineComponent({
      components: {
        PanelErrorBoundary,
        FailingDraft: failing.Draft,
        SiblingDraft: sibling.Draft,
      },
      template: `
        <div>
          <PanelErrorBoundary ref="failing"><FailingDraft /></PanelErrorBoundary>
          <PanelErrorBoundary ref="sibling"><SiblingDraft /></PanelErrorBoundary>
        </div>
      `,
    });

    const wrapper = mount(Host, { global: { plugins: [i18n] } });
    const boundaries = wrapper.findAllComponents(PanelErrorBoundary);
    expect(boundaries).toHaveLength(2);

    const failingBoundary = boundaries[0]!;
    const siblingBoundary = boundaries[1]!;
    const failingVm = failingBoundary.vm as unknown as {
      reportError: (err: unknown) => void;
    };

    sibling.writeDraft('sibling draft');
    await nextTick();

    const siblingInstance = sibling.instanceId.value;
    expect(siblingInstance).not.toBeNull();
    expect(sibling.mountIds).toEqual([siblingInstance]);
    expect(sibling.unmountIds).toEqual([]);

    failingVm.reportError(new Error('panel boom'));
    await nextTick();

    expect(failingBoundary.find('[data-testid="panel-error-fallback"]').exists()).toBe(true);
    expect(
      failingBoundary.get('[data-testid="panel-error-content"]').attributes('style'),
    ).toContain('display: none');

    expect(siblingBoundary.find('[data-testid="panel-error-fallback"]').exists()).toBe(false);
    expect(
      siblingBoundary.get('[data-testid="panel-error-content"]').attributes('style') ?? '',
    ).not.toContain('display: none');
    expect(siblingBoundary.get('[data-testid="draft-panel"]').isVisible()).toBe(true);
    expect(sibling.instanceId.value).toBe(siblingInstance);
    expect(sibling.mountIds).toEqual([siblingInstance]);
    expect(sibling.unmountIds).toEqual([]);
    expect(sibling.readDraft()).toBe('sibling draft');

    await failingBoundary.get('[data-testid="panel-error-retry"]').trigger('click');
    await nextTick();

    expect(failingBoundary.find('[data-testid="panel-error-fallback"]').exists()).toBe(false);
    expect(siblingBoundary.find('[data-testid="panel-error-fallback"]').exists()).toBe(false);
    expect(siblingBoundary.get('[data-testid="draft-panel"]').isVisible()).toBe(true);
    expect(sibling.instanceId.value).toBe(siblingInstance);
    expect(sibling.mountIds).toEqual([siblingInstance]);
    expect(sibling.unmountIds).toEqual([]);
    expect(sibling.readDraft()).toBe('sibling draft');
    wrapper.unmount();
  });

  it('resets when resetKey changes while in error state', async () => {
    const Host = defineComponent({
      components: { PanelErrorBoundary, Healthy },
      setup() {
        const resetKey = ref<string | null>('tab-a');
        return { resetKey };
      },
      template: `
        <PanelErrorBoundary ref="boundary" :reset-key="resetKey">
          <Healthy />
        </PanelErrorBoundary>
      `,
    });

    const wrapper = mount(Host, { global: { plugins: [i18n] } });
    const boundary = wrapper.findComponent(PanelErrorBoundary);
    const vm = boundary.vm as unknown as {
      reportError: (err: unknown) => void;
      contentKey: number;
    };

    vm.reportError(new Error('panel boom'));
    await nextTick();
    expect(wrapper.find('[data-testid="panel-error-fallback"]').exists()).toBe(true);
    const keyBefore = Number(vm.contentKey);

    (wrapper.vm as { resetKey: string }).resetKey = 'tab-b';
    await nextTick();

    expect(wrapper.find('[data-testid="panel-error-fallback"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="panel-ok"]').text()).toBe('ok');
    expect(Number(vm.contentKey)).toBe(keyBefore + 1);
    wrapper.unmount();
  });

  it('rebuilds the draft subtree with a fresh instance when the parent changes resetKey', async () => {
    const harness = createDraftHarness();

    // 与 AppShell 的真实结构一致：父级按 tab/route 给被路由的业务组件设 key，
    // resetKey 变化时父级显式重建子树，而 Retry 路径必须保留原实例。
    const Host = defineComponent({
      components: { PanelErrorBoundary, Draft: harness.Draft },
      setup() {
        const resetKey = ref<string>('tab-a');
        return { resetKey };
      },
      template: `
        <PanelErrorBoundary :reset-key="resetKey">
          <Draft :key="resetKey" />
        </PanelErrorBoundary>
      `,
    });

    const wrapper = mount(Host, { global: { plugins: [i18n] } });
    const boundary = wrapper.findComponent(PanelErrorBoundary);
    const vm = boundary.vm as unknown as {
      reportError: (err: unknown) => void;
    };

    harness.writeDraft('tab-a draft');
    await nextTick();

    const firstInstance = harness.instanceId.value;
    expect(firstInstance).not.toBeNull();
    expect(harness.mountIds).toEqual([firstInstance]);
    expect(harness.unmountIds).toEqual([]);

    vm.reportError(new Error('panel boom'));
    await nextTick();
    expect(wrapper.find('[data-testid="panel-error-fallback"]').exists()).toBe(true);

    (wrapper.vm as { resetKey: string }).resetKey = 'tab-b';
    await nextTick();

    expect(wrapper.find('[data-testid="panel-error-fallback"]').exists()).toBe(false);
    expect(
      wrapper.get('[data-testid="panel-error-content"]').attributes('style') ?? '',
    ).not.toContain('display: none');

    const secondInstance = harness.instanceId.value;
    expect(secondInstance).not.toBeNull();
    expect(secondInstance).not.toBe(firstInstance);
    expect(wrapper.get('[data-testid="draft-panel"]').attributes('data-instance-id')).toBe(
      secondInstance,
    );
    expect(harness.mountIds).toEqual([firstInstance, secondInstance]);
    expect(harness.unmountIds).toEqual([firstInstance]);
    expect(harness.readDraft()).toBe('');
    expect((wrapper.get('[data-testid="draft-input"]').element as HTMLTextAreaElement).value).toBe(
      '',
    );
    wrapper.unmount();
  });
});
