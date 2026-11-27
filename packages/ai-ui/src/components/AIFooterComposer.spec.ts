import { installAiUiHost } from '@ai-ui-test-host/di/ai-ui-host';
installAiUiHost();
/** @vitest-environment jsdom */
import { nextTick } from 'vue';
import { composerDocument } from './composer-editor';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { productionLocaleMessages } from '@ai-ui-test-host/locales/production-messages';
import AIFooterComposer from './AIFooterComposer.vue';
import type { AIWorkspaceRecentKnowledgeNote, ComposerContextEntity } from '../composables/types';
import { semanticElevationClass } from '@ai-ui-test-host/shared/constants/semantic-elevation';

vi.mock('@memoflow/ui-vue-shadcn', async () => {
  const vue = await import('vue');
  const passthrough = (name: string) =>
    vue.defineComponent({
      name,
      inheritAttrs: false,
      setup(_, { slots, attrs, emit }) {
        return () =>
          vue.h(
            name.startsWith('Button') ? 'button' : 'div',
            {
              ...attrs,
              type: name.startsWith('Button') ? 'button' : undefined,
              onClick: (e: Event) => {
                emit('click', e);
              },
            },
            slots.default?.(),
          );
      },
    });
  return {
    Button: passthrough('ButtonStub'),
    DropdownMenu: passthrough('DropdownMenuStub'),
    DropdownMenuTrigger: passthrough('DropdownMenuTriggerStub'),
    DropdownMenuContent: passthrough('DropdownMenuContentStub'),
    DropdownMenuItem: passthrough('DropdownMenuItemStub'),
    DropdownMenuSeparator: passthrough('DropdownMenuSeparatorStub'),
    DropdownMenuSub: passthrough('DropdownMenuSubStub'),
    DropdownMenuSubContent: passthrough('DropdownMenuSubContentStub'),
    DropdownMenuSubTrigger: passthrough('DropdownMenuSubTriggerStub'),
    Select: passthrough('SelectStub'),
    SelectTrigger: passthrough('SelectTriggerStub'),
    SelectValue: passthrough('SelectValueStub'),
    SelectContent: passthrough('SelectContentStub'),
    SelectGroup: passthrough('SelectGroupStub'),
    SelectLabel: passthrough('SelectLabelStub'),
    SelectItem: passthrough('SelectItemStub'),
  };
});

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: productionLocaleMessages,
});

async function mountComposer(
  props: Partial<{
    modelValue: string;
    localAgent: boolean;
    loading: boolean;
    canSend: boolean;
    attachments: Array<{
      id: string;
      data: string;
      mediaType: string;
      filename?: string;
      size: number;
    }>;
    contextEntities: ComposerContextEntity[];
    recentGoals: Array<{
      id: string;
      title: string;
      status: string;
      updatedAt: number;
      progress: number | null;
    }>;
    recentTasks: Array<{ id: string; title: string; updatedAt: number }>;
    recentKnowledgeNotes: AIWorkspaceRecentKnowledgeNote[];
    knowledgeLoading: boolean;
    knowledgeError: string | null;
    modelGroups: Array<{
      providerId: string;
      providerName: string;
      models: Array<{ key: string; modelName: string }>;
    }>;
    selectedModelKey: string;
    density: 'comfortable' | 'compact' | 'icon';
  }> = {},
) {
  const wrapper = mount(AIFooterComposer, {
    props: {
      modelValue: '',
      loading: false,
      canSend: true,
      attachments: [],
      contextEntities: [],
      recentGoals: [],
      recentTasks: [],
      recentKnowledgeNotes: [],
      modelGroups: [
        {
          providerId: 'p1',
          providerName: 'Provider',
          models: [{ key: 'm1', modelName: 'Model 1' }],
        },
      ],
      selectedModelKey: 'm1',
      density: 'comfortable',
      ...props,
    },
    global: {
      plugins: [i18n],
      stubs: {
        Settings2: true,
        ArrowUp: true,
        Square: true,
        Plus: true,
        Paperclip: true,
        FileText: true,
        ListChecks: true,
        Target: true,
        Check: true,
        X: true,
      },
    },
  });
  await nextTick();
  await nextTick();
  return wrapper;
}

async function editDraft(wrapper: Awaited<ReturnType<typeof mountComposer>>, value: string) {
  const editor = wrapper.vm.editor!;
  editor.commands.setContent(composerDocument(value));
  editor.commands.setTextSelection(editor.state.doc.content.size - 1);
  await wrapper.setProps({ modelValue: value });
  await nextTick();
}

describe('AIFooterComposer (Global Composer input)', () => {
  it('compiles the literal @ hint in both production locales', async () => {
    for (const locale of ['zh-CN', 'en-US'] as const) {
      i18n.global.locale.value = locale;
      expect(i18n.global.t('aiAssistant.chatPage.context.mentionMoreHint')).toContain('@');
    }
    i18n.global.locale.value = 'en-US';
  });

  it('clears undo history on external draft resets and accepts subsequent edits', async () => {
    const wrapper = await mountComposer();
    await editDraft(wrapper, 'old conversation draft');
    await wrapper.setProps({ modelValue: '' });
    const editor = wrapper.vm.editor!;
    expect(editor.getText()).toBe('');
    expect(editor.commands.undo()).toBe(false);
    editor.commands.insertContent('new draft');
    expect(editor.getText()).toBe('new draft');
    wrapper.unmount();
  });

  it('places attachments at the left and model choice beside the right-hand send action', async () => {
    const wrapper = await mountComposer({ modelValue: 'hello' });
    const attachments = wrapper.get('[data-testid="ai-composer-attachments"]');
    const actions = wrapper.get('[data-testid="ai-composer-actions"]');
    const model = actions.get('[data-testid="ai-chat-model-selector"]');
    const send = actions.get('[data-testid="ai-chat-send-message"]');
    expect(attachments.get('[data-testid="ai-chat-upload-file"]').exists()).toBe(true);
    expect(
      attachments.element.compareDocumentPosition(actions.element) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      model.element.compareDocumentPosition(send.element) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    wrapper.unmount();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses a bordered composer without floating elevation and inset context chips while preserving removal events', async () => {
    const wrapper = await mountComposer({
      attachments: [
        {
          id: 'a1',
          data: 'data:image/png;base64,AAAA',
          mediaType: 'image/png',
          size: 4,
        },
      ],
      contextEntities: [{ entityType: 'task', id: 't1', label: 'Review', origin: 'explicit' }],
    });

    expect(wrapper.get('[data-testid="ai-composer-surface"]').classes()).not.toContain(
      semanticElevationClass('floating'),
    );
    for (const selector of ['ai-composer-attachment-chip', 'ai-composer-entity-chip']) {
      const chip = wrapper.get(`[data-testid="${selector}"]`);
      expect(chip.classes()).toContain(semanticElevationClass('inset'));
      await chip.get('button').trigger('click');
    }
    expect(wrapper.emitted('remove-attachment')).toEqual([['a1']]);
    expect(wrapper.emitted('remove-context-entity')).toEqual([['task', 't1']]);
    wrapper.unmount();
  });

  it('cancels pointer focus on primary actions while preserving click and keyboard activation', async () => {
    const wrapper = await mountComposer({ modelValue: 'draft' });
    const editor = wrapper.vm.editor!;
    for (const loading of [false, true]) {
      await wrapper.setProps({ loading });
      const action = wrapper.get(
        loading
          ? '[data-testid="ai-chat-stop-generating"]'
          : '[data-testid="ai-chat-send-message"]',
      );
      const pointer = new Event('pointerdown', { bubbles: true, cancelable: true });
      action.element.dispatchEvent(pointer);
      expect(pointer.defaultPrevented).toBe(true);
      expect(action.attributes('tabindex')).not.toBe('-1');
      await action.trigger('click', { detail: 0 });
      expect(wrapper.emitted(loading ? 'stop' : 'send')).toHaveLength(1);
      expect(wrapper.vm.editor).toBe(editor);
      expect(editor.getText()).toBe('draft');
    }
    const uploadPointer = new Event('pointerdown', { bubbles: true, cancelable: true });
    wrapper.get('[data-testid="ai-chat-upload-file"]').element.dispatchEvent(uploadPointer);
    expect(uploadPointer.defaultPrevented).toBe(true);
    wrapper.unmount();
  });

  it('keeps the editor and draft through density, unavailable-model and knowledge-error changes', async () => {
    const wrapper = await mountComposer({ modelValue: '保留草稿' });
    const editor = wrapper.vm.editor!;
    for (const density of ['icon', 'compact', 'comfortable'] as const) {
      await wrapper.setProps({
        density,
        canSend: false,
        modelGroups: [],
        knowledgeError: 'unavailable',
      });
      expect(wrapper.vm.editor).toBe(editor);
      expect(editor.getText()).toBe('保留草稿');
      expect(wrapper.get('[data-testid="ai-chat-composer"]').attributes('contenteditable')).toBe(
        'true',
      );
      expect(
        (wrapper.get('[data-testid="ai-chat-send-message"]').element as HTMLButtonElement).disabled,
      ).toBe(true);
    }
    wrapper.unmount();
  });

  it('forwards model selection and file drops without submitting the draft', async () => {
    const wrapper = await mountComposer({ modelValue: 'draft' });
    wrapper.findComponent({ name: 'SelectStub' }).vm.$emit('update:modelValue', 'm2');
    expect(wrapper.emitted('select-model')).toEqual([['m2']]);
    const file = new File(['note'], 'note.md', { type: 'text/markdown' });
    await wrapper.get('[data-testid="ai-composer-surface"]').trigger('drop', {
      dataTransfer: { files: [file] },
    });
    expect(wrapper.emitted('add-files')).toEqual([[[file]]]);
    expect(wrapper.emitted('send')).toBeUndefined();
    expect(wrapper.vm.editor!.getText()).toBe('draft');
    wrapper.unmount();
  });

  it('sends on Enter and keeps Shift+Enter as newline', async () => {
    const wrapper = await mountComposer({ modelValue: 'hello' });
    const textarea = wrapper.get('[data-testid="ai-chat-composer"]');

    await textarea.trigger('keydown', { key: 'Enter', shiftKey: false });
    expect(wrapper.emitted('send')).toHaveLength(1);

    await textarea.trigger('keydown', { key: 'Enter', shiftKey: true });
    expect(wrapper.emitted('send')).toHaveLength(1);
    wrapper.unmount();
  });

  it('keeps Enter inside a pending mention query and closes it through Escape without reopening on keyup', async () => {
    const wrapper = await mountComposer({ knowledgeLoading: true });
    const textarea = wrapper.get('[data-testid="ai-chat-composer"]');
    await editDraft(wrapper, '@missing');
    await wrapper.setProps({ modelValue: '@missing' });
    await nextTick();
    expect(wrapper.emitted('knowledge-query')?.at(-1)).toEqual(['missing']);
    expect(wrapper.find('[data-testid="ai-composer-mention-menu"]').exists()).toBe(true);
    await textarea.trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('send')).toBeUndefined();
    expect(wrapper.emitted('toggle-context-entity')).toBeUndefined();
    await textarea.trigger('keydown', { key: 'Escape' });
    await textarea.trigger('keyup', { key: 'Escape' });
    expect(wrapper.find('[data-testid="ai-composer-mention-menu"]').exists()).toBe(false);
    expect(wrapper.emitted('knowledge-query')?.at(-1)).toEqual([null]);
    wrapper.unmount();
  });

  it('selects ordinary Markdown by its source and replaces a previously selected stale version', async () => {
    const source = {
      kind: 'local_vault' as const,
      bindingId: 'vault-1',
      relativePath: 'ideas/ordinary.md',
      contentHash: 'b'.repeat(64),
    };
    const wrapper = await mountComposer({
      recentKnowledgeNotes: [
        {
          id: 'source-1',
          contextId: 'source-1',
          title: 'Ordinary note',
          path: source.relativePath,
          updatedAt: 1,
          source,
        },
      ],
      contextEntities: [
        {
          entityType: 'knowledge_source',
          id: 'source-1',
          label: 'Ordinary note',
          origin: 'explicit',
          source: { ...source, contentHash: 'a'.repeat(64) },
        },
      ],
    });
    const textarea = wrapper.get('[data-testid="ai-chat-composer"]');
    await editDraft(wrapper, '@ideas');
    await wrapper.setProps({ modelValue: '@ideas' });
    await nextTick();
    expect(wrapper.get('[data-testid="ai-composer-mention-option"]').text()).toContain(
      'ideas/ordinary.md',
    );
    await textarea.trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('toggle-context-entity')).toEqual([
      [
        {
          entityType: 'knowledge_source',
          id: 'source-1',
          label: 'Ordinary note',
          path: source.relativePath,
          source,
        },
      ],
    ]);
    expect(wrapper.emitted('send')).toBeUndefined();
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['@Ordinary note ']);
    expect(wrapper.find('[data-testid="ai-composer-mention-menu"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('does not send while IME composition is active', async () => {
    const wrapper = await mountComposer({ modelValue: '你好' });
    const textarea = wrapper.get('[data-testid="ai-chat-composer"]');

    await textarea.trigger('compositionstart');
    await textarea.trigger('keydown', {
      key: 'Enter',
      shiftKey: false,
      isComposing: true,
      keyCode: 229,
    });
    expect(wrapper.emitted('send')).toBeUndefined();

    await textarea.trigger('compositionend');
    await textarea.trigger('keydown', {
      key: 'Enter',
      shiftKey: false,
      isComposing: false,
      keyCode: 13,
    });
    expect(wrapper.emitted('send')).toHaveLength(1);
    wrapper.unmount();
  });

  it('allows typing during a run without submitting or queueing and keeps Stop independent', async () => {
    const wrapper = await mountComposer({ loading: true, modelValue: 'next' });
    const textarea = wrapper.get('[data-testid="ai-chat-composer"]');
    expect(textarea.attributes('contenteditable')).toBe('true');
    await editDraft(wrapper, 'next message');
    await textarea.trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['next message']);
    expect(wrapper.emitted('send')).toBeUndefined();
    await wrapper.get('[data-testid="ai-chat-stop-generating"]').trigger('click');
    expect(wrapper.emitted('stop')).toHaveLength(1);
    await wrapper.setProps({ loading: false, modelValue: 'next message' });
    expect(wrapper.emitted('send')).toBeUndefined();
    wrapper.unmount();
  });

  it('emits stop while loading and send when idle', async () => {
    const loading = await mountComposer({ loading: true, modelValue: 'x' });
    await loading.get('[data-testid="ai-chat-stop-generating"]').trigger('click');
    expect(loading.emitted('stop')).toHaveLength(1);
    expect(loading.find('[data-testid="ai-chat-send-message"]').exists()).toBe(false);
    loading.unmount();

    const idle = await mountComposer({ loading: false, modelValue: 'x' });
    await idle.get('[data-testid="ai-chat-send-message"]').trigger('click');
    expect(idle.emitted('send')).toHaveLength(1);
    idle.unmount();
  });

  it('disables send when empty or canSend is false', async () => {
    const empty = await mountComposer({ modelValue: '   ' });
    expect(
      (empty.get('[data-testid="ai-chat-send-message"]').element as HTMLButtonElement).disabled,
    ).toBe(true);
    empty.unmount();

    const blocked = await mountComposer({ modelValue: 'hi', canSend: false });
    expect(
      (blocked.get('[data-testid="ai-chat-send-message"]').element as HTMLButtonElement).disabled,
    ).toBe(true);
    blocked.unmount();
  });

  it('shows a compact empty-models configuration control', async () => {
    const wrapper = await mountComposer({ modelGroups: [] });
    expect(wrapper.find('[data-testid="ai-chat-empty-models"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('opens the native file picker directly and has no nested context menu', async () => {
    const wrapper = await mountComposer({ localAgent: true });
    const input = wrapper.get('[data-testid="ai-chat-file-input"]').element as HTMLInputElement;
    const click = vi.spyOn(input, 'click').mockImplementation(() => undefined);
    await wrapper.get('[data-testid="ai-chat-upload-file"]').trigger('click');
    expect(click).toHaveBeenCalledOnce();
    expect(wrapper.findAllComponents({ name: 'DropdownMenuSubStub' })).toHaveLength(0);
    wrapper.unmount();
  });

  it('keeps a bounded scrolling editor for multiline text', async () => {
    const wrapper = await mountComposer();
    await editDraft(wrapper, 'first\nsecond\nthird');
    expect(wrapper.get('[data-testid="ai-chat-composer"]').findAll('p')).toHaveLength(3);
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['first\nsecond\nthird']);
    wrapper.unmount();
  });

  it('keeps the draft editable while AI is unavailable', async () => {
    const wrapper = await mountComposer({
      modelGroups: [],
      canSend: false,
      selectedModelKey: '',
    });

    expect(wrapper.get('[data-testid="ai-chat-composer"]').attributes('contenteditable')).toBe(
      'true',
    );
    wrapper.unmount();
  });

  it('removes the manual intent selector and exposes one add-context control instead', async () => {
    const wrapper = await mountComposer({
      modelGroups: [],
      canSend: false,
      selectedModelKey: '',
    });

    expect(wrapper.find('[data-testid="ai-chat-tool-menu-trigger"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="ai-chat-upload-file"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="ai-chat-empty-models"]').exists()).toBe(true);

    const cueText = wrapper.find('[data-testid="ai-chat-empty-models"]').text();
    expect(cueText).not.toMatch(/aiAssistant\.chatPage/);
    expect(cueText.length).toBeGreaterThan(0);

    wrapper.unmount();
  });

  it('allows attachment-only submit and emits pasted files', async () => {
    const wrapper = await mountComposer({
      attachments: [
        {
          id: 'a1',
          data: 'data:image/png;base64,AAAA',
          mediaType: 'image/png',
          filename: 'screen.png',
          size: 4,
        },
      ],
    });

    expect(
      (wrapper.get('[data-testid="ai-chat-send-message"]').element as HTMLButtonElement).disabled,
    ).toBe(false);
    expect(wrapper.find('[data-testid="ai-composer-attachment-chip"]').exists()).toBe(true);

    const pasted = new File(['abc'], 'paste.png', { type: 'image/png' });
    await wrapper.get('[data-testid="ai-chat-composer"]').trigger('paste', {
      clipboardData: { files: [pasted] },
    });
    expect(wrapper.emitted('add-files')?.[0]?.[0]).toEqual([pasted]);
    wrapper.unmount();
  });

  it('accepts pasted screenshots from ClipboardItem when clipboard.files is empty', async () => {
    const wrapper = await mountComposer({ localAgent: true });
    const screenshot = new File(['png'], 'clipboard.png', {
      type: 'image/png',
    });

    await wrapper.get('[data-testid="ai-chat-composer"]').trigger('paste', {
      clipboardData: {
        files: [],
        items: [{ kind: 'file', getAsFile: () => screenshot }],
      },
    });

    expect(wrapper.emitted('add-files')?.[0]?.[0]).toEqual([screenshot]);
    wrapper.unmount();
  });

  it('supports @ mention autocomplete for goals, tasks, and notes', async () => {
    const wrapper = await mountComposer({
      modelValue: 'compare @Ship',
      recentGoals: [
        {
          id: 'g1',
          title: 'Ship v1',
          status: 'InProgress',
          updatedAt: 10,
          progress: 20,
        },
      ],
      recentTasks: [{ id: 't1', title: 'Review release', updatedAt: 9 }],
      recentKnowledgeNotes: [
        {
          id: 'projection-n1',
          contextId: 'kdoc-n1',
          title: 'Release notes',
          path: 'notes/release.md',
          updatedAt: 8,
        },
      ],
    });
    await editDraft(wrapper, 'compare @Ship');

    expect(wrapper.find('[data-testid="ai-composer-mention-menu"]').exists()).toBe(true);
    const options = wrapper.findAll('[data-testid="ai-composer-mention-option"]');
    expect(options).toHaveLength(1);
    expect(options[0].text()).toContain('Ship v1');

    await options[0].trigger('mousedown');
    expect(wrapper.emitted('toggle-context-entity')?.[0]?.[0]).toEqual({
      entityType: 'goal',
      id: 'g1',
      label: 'Ship v1',
    });
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toBe('compare @Ship v1 ');
    expect(wrapper.get('[data-testid="ai-composer-inline-mention"]').text()).toContain('Ship v1');
    await wrapper.setProps({
      modelValue: 'compare @Ship v1 ',
      contextEntities: [{ entityType: 'goal', id: 'g1', label: 'Ship v1', origin: 'explicit' }],
    });
    expect(wrapper.find('[data-testid="ai-composer-entity-chip"]').exists()).toBe(false);
    const editor = wrapper.vm.editor!;
    editor.commands.setContent(composerDocument('compare '));
    await nextTick();
    expect(wrapper.emitted('remove-context-entity')?.at(-1)).toEqual(['goal', 'g1']);
    wrapper.unmount();
  });

  it('renders explicit entity chips as removable context', async () => {
    const wrapper = await mountComposer({
      contextEntities: [{ entityType: 'goal', id: 'g1', label: 'Ship v1', origin: 'explicit' }],
    });

    expect(wrapper.get('[data-testid="ai-composer-entity-chip"]').text()).toContain('Ship v1');
    const chipButton = wrapper.get('[data-testid="ai-composer-entity-chip"] button');
    await chipButton.trigger('click');
    expect(wrapper.emitted('remove-context-entity')?.[0]).toEqual(['goal', 'g1']);
    wrapper.unmount();
  });
});
