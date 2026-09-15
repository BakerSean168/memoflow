/** @vitest-environment happy-dom */

import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import { nextTick } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RuleEditorView from './RuleEditorView.vue';
import enUS from '../../../locales/en-US';
import { useAppShellStore } from '../../../layouts/shell/useAppShellStore';

// hoisted 非响应式桩对象：测试内直接改 value，配合表单输入触发 computed 重算。
const governanceMocks = vi.hoisted(() => ({
  isSaving: { value: false },
  fetchRule: vi.fn(async () => undefined),
  createRule: vi.fn(async () => null),
  updateRule: vi.fn(async () => null),
}));

vi.mock('../composables/useGovernance', () => ({
  useGovernance: () => ({
    currentRuleView: { value: null },
    isLoading: { value: false },
    isSaving: governanceMocks.isSaving,
    error: { value: null },
    allTags: { value: [] },
    fetchRule: governanceMocks.fetchRule,
    createRule: governanceMocks.createRule,
    updateRule: governanceMocks.updateRule,
  }),
}));

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: { 'en-US': enUS },
});

const TagInputStub = {
  name: 'TagInput',
  props: ['label', 'placeholder'],
  template: '<div data-testid="tag-input" />',
};

async function mountEditor() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/governance', name: 'governance-list', component: { template: '<div />' } },
      { path: '/governance/new', component: { template: '<div />' } },
    ],
  });
  await router.push('/governance/new');
  await router.isReady();

  const wrapper = mount(RuleEditorView, {
    global: {
      plugins: [pinia, router, i18n],
      stubs: { TagInput: TagInputStub },
    },
  });
  await nextTick();
  return { wrapper, store: useAppShellStore() };
}

describe('RuleEditorView surface status (Phase 0 / UI-004)', () => {
  beforeEach(() => {
    governanceMocks.isSaving.value = false;
  });

  it('reports clean after loading, dirty after editing, and clean after reverting', async () => {
    const { wrapper, store } = await mountEditor();
    expect(store.surfaceStatus).toBe('clean');

    const titleInput = wrapper.findAll('input[type="text"]')[1]!;
    await titleInput.setValue('My first rule');
    await nextTick();
    expect(store.surfaceStatus).toBe('dirty');

    await titleInput.setValue('');
    await nextTick();
    expect(store.surfaceStatus).toBe('clean');
  });

  it('reports busy while saving, overriding dirty', async () => {
    const { wrapper, store } = await mountEditor();
    const titleInput = wrapper.findAll('input[type="text"]')[1]!;
    await titleInput.setValue('My first rule');
    await nextTick();
    expect(store.surfaceStatus).toBe('dirty');

    governanceMocks.isSaving.value = true;
    await titleInput.setValue('My first rule v2'); // 触发表单依赖重算
    await nextTick();
    expect(store.surfaceStatus).toBe('busy');

    governanceMocks.isSaving.value = false;
    await titleInput.setValue('My first rule v3'); // 值变化触发依赖重算
    await nextTick();
    expect(store.surfaceStatus).toBe('dirty');
  });
});
