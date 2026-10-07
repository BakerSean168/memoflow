import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { useAppShellStore } from '../../../layouts/shell/useAppShellStore';
import { canLeaveBusinessSurface } from '../../../layouts/shell/surface-leave-protocol';
import { canLeaveAIWorkflowReview } from '../../ai/composables/chatViewHelpers';
import { KeepAlive, defineComponent, h, ref } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KnowledgeDraftSchema } from '@memoflow/contracts/ai';
import type {
  KnowledgeCaptureSourceOption,
  KnowledgeCaptureNativeEditSession,
} from '../composables/knowledgeCaptureNativeEditSession';
import KnowledgeCaptureReviewDialog from './KnowledgeCaptureReviewDialog.vue';

const host = vi.hoisted(() => ({ register: vi.fn(), unregister: vi.fn() }));
vi.mock('../../../layouts/shell/useKnowledgeNativeSurface', () => ({
  useKnowledgeNativeSurfaceRegistration: () => host,
}));
vi.mock('vue-router', () => ({
  useRoute: () => ({ fullPath: '/repository?dialog=knowledge-capture' }),
}));
const source = { kind: 'repository' as const, connectionId: 'binding-1' };
const option = { key: 'repository:binding-1', label: 'Owner / Notes', source };
const proposal = KnowledgeDraftSchema.parse({
  title: 'Reviewed note',
  topic: 'Durability',
  markdown: '# Reviewed',
  targetSubpath: 'notes/review.md',
  tags: ['ai'],
  revision: 1,
  knowledgeDocumentId: 'kdoc_550e8400-e29b-41d4-a716-446655440701',
});
const passthrough = defineComponent({
  setup(_, { slots }) {
    return () => h('div', [slots.default?.(), slots.title?.(), slots.footer?.()]);
  },
});
const openDialog = defineComponent({
  props: ['open'],
  setup(props, { slots }) {
    return () => (props.open ? h('div', slots.default?.()) : null);
  },
});
function setup(options: KnowledgeCaptureSourceOption[] = [option], pinia: Pinia = createPinia()) {
  const wrapper = mount(KnowledgeCaptureReviewDialog, {
    props: { open: true, sourceOptions: options },
    global: {
      plugins: [
        pinia,
        createI18n({ legacy: false, locale: 'en', messages: {}, missingWarn: false }),
      ],
      stubs: { Dialog: openDialog, ProductDialogShell: passthrough },
    },
  });
  const session = host.register.mock.calls.at(-1)?.[1] as KnowledgeCaptureNativeEditSession;
  return { wrapper, session };
}
beforeEach(() => {
  vi.clearAllMocks();
  host.register.mockReturnValue(host.unregister);
});
describe('Repository native Knowledge review', () => {
  it('preserves the actual native draft when conversation departure is declined or busy', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const shell = useAppShellStore();
    shell.openTab({
      module: 'repository',
      route: '/repository?dialog=knowledge-capture',
      title: 'Review',
      intent: 'deeplink',
    });
    const { wrapper, session } = setup([option], pinia);
    session.projectDraft(proposal);
    session.patch({ title: 'Unsaved native edit' });
    await flushPromises();
    expect(shell.surfaceStatus).toBe('dirty');
    const before = session.readDraftState().draft;
    const originalConfirm = window.confirm;
    const confirm = vi.fn(() => false);
    window.confirm = confirm;
    const leave = () =>
      canLeaveAIWorkflowReview(
        'knowledge-capture',
        { goal: false, task: false, knowledge: false },
        () => canLeaveBusinessSurface((key) => key),
        vi.fn(),
      );
    expect(leave()).toBe(false);
    expect(session.readDraftState().draft).toEqual(before);
    expect(wrapper.emitted('update:open')).toBeUndefined();
    session.setEditingBlocked(true);
    await flushPromises();
    expect(shell.surfaceStatus).toBe('busy');
    expect(leave()).toBe(false);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(session.readDraftState().draft).toEqual(before);
    window.confirm = originalConfirm;
    wrapper.unmount();
  });

  it('projects a default source, returns detached validated edits, and never persists', async () => {
    const { wrapper, session } = setup();
    session.projectDraft(proposal);
    expect(session.readDraftState()).toMatchObject({ dirty: false, draft: { source } });
    session.patch({ title: 'Owner title', tags: ['owner'] });
    expect(session.readDraftState().dirty).toBe(true);
    await wrapper.get('[data-testid="knowledge-capture-native-title"]').setValue('Manual title');
    const snapshot = await session.requestSubmit();
    expect(snapshot).toMatchObject({ title: 'Manual title', tags: ['owner'], source });
    snapshot!.tags.push('outside');
    expect(session.readDraftState().draft.tags).toEqual(['owner']);
    expect(host.register).toHaveBeenCalledWith('/repository?dialog=knowledge-capture', session);
    wrapper.unmount();
    expect(host.unregister).toHaveBeenCalledTimes(1);
    expect(() => session.readDraftState()).toThrow('closed');
  });
  it('defaults a source loaded after mount and validates current source availability', async () => {
    const { wrapper, session } = setup([]);
    session.projectDraft(proposal);
    expect(await session.requestSubmit()).toBeNull();
    await wrapper.setProps({ sourceOptions: [option] });
    expect(session.readDraftState().draft.source).toEqual(source);
    expect(await session.requestSubmit()).not.toBeNull();
    await wrapper.setProps({ sourceOptions: [] });
    expect(await session.requestSubmit()).toBeNull();
    wrapper.unmount();
  });
  it('requires explicit selection with multiple sources and honors an owner default', async () => {
    const second = { key: 'local_vault', label: 'Local', source: { kind: 'local_vault' as const } };
    const { wrapper, session } = setup([option, second]);
    session.projectDraft(proposal);
    expect(session.readDraftState().draft.source).toBeUndefined();
    await wrapper.setProps({ defaultSourceKey: option.key });
    expect(session.readDraftState().draft.source).toEqual(source);
    wrapper.unmount();
  });
  it('fails validation, protects dirty projections and expected snapshots, and blocks busy edits', async () => {
    const { wrapper, session } = setup();
    session.projectDraft(proposal);
    const expectedDraft = session.readDraftState().draft;
    session.patch({ targetSubpath: '/private/vault.md' });
    expect(await session.requestSubmit()).toBeNull();
    expect(() => session.projectDraft(proposal)).toThrow('unsaved');
    await expect(session.requestSubmit({ expectedDraft })).rejects.toThrow('changed');
    session.setEditingBlocked(true);
    expect(() => session.patch({ title: 'Late edit' })).toThrow('busy');
    expect(() => session.requestCancel()).toThrow('busy');
    session.setEditingBlocked(false);
    wrapper.unmount();
  });
  it('delegates confirm/cancel coordination and closes without an owner write', async () => {
    const { wrapper, session } = setup();
    const submit = vi.fn(async () => undefined);
    const cancel = vi.fn(async () => {
      session.requestCancel();
    });
    session.coordinateSubmit(submit, cancel);
    await flushPromises();
    await wrapper.get('[data-testid="knowledge-capture-native-confirm"]').trigger('click');
    await wrapper.get('[data-testid="knowledge-capture-native-cancel"]').trigger('click');
    await flushPromises();
    expect(submit).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(wrapper.emitted('update:open')).toEqual([[false]]);
    await wrapper.setProps({ open: false });
    expect(host.unregister).toHaveBeenCalled();
    wrapper.unmount();
  });
  it('allocates a fresh owner session when a closed review reopens', async () => {
    const { wrapper, session: retired } = setup();
    retired.projectDraft(proposal);
    retired.patch({ title: 'Discarded owner edit' });
    await wrapper.setProps({ open: false });
    await wrapper.setProps({ open: true });
    const reopened = host.register.mock.calls.at(-1)?.[1] as KnowledgeCaptureNativeEditSession;
    expect(reopened).not.toBe(retired);
    expect(() => retired.readDraftState()).toThrow('closed');
    reopened.projectDraft(proposal);
    expect(reopened.readDraftState()).toMatchObject({
      dirty: false,
      draft: { title: proposal.title },
    });
    wrapper.unmount();
  });
  it('hides and unregisters a cached inactive review, then registers a fresh session on activation', async () => {
    const visible = ref(true);
    const other = defineComponent({ render: () => h('div', 'Other workspace') });
    const wrapper = mount(
      defineComponent({
        setup() {
          return () =>
            h(KeepAlive, null, {
              default: () =>
                visible.value
                  ? h(KnowledgeCaptureReviewDialog, { open: true, sourceOptions: [option] })
                  : h(other),
            });
        },
      }),
      {
        global: {
          plugins: [createI18n({ legacy: false, locale: 'en', messages: {}, missingWarn: false })],
          stubs: { Dialog: openDialog, ProductDialogShell: passthrough },
        },
      },
    );
    const retired = host.register.mock.calls.at(-1)?.[1] as KnowledgeCaptureNativeEditSession;
    retired.projectDraft(proposal);
    visible.value = false;
    await flushPromises();
    expect(() => retired.readDraftState()).toThrow('closed');
    expect(wrapper.find('[data-testid="knowledge-capture-native-form"]').exists()).toBe(false);
    visible.value = true;
    await flushPromises();
    const restored = host.register.mock.calls.at(-1)?.[1] as KnowledgeCaptureNativeEditSession;
    expect(restored).not.toBe(retired);
    restored.projectDraft(proposal);
    expect(wrapper.find('[data-testid="knowledge-capture-native-form"]').exists()).toBe(true);
    wrapper.unmount();
  });
});
