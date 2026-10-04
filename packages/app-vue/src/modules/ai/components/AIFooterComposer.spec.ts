/** @vitest-environment jsdom */
import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { productionLocaleMessages } from '../../../locales/production-messages';
import AIFooterComposer from './AIFooterComposer.vue';
import { semanticElevationClass } from '../../../shared/constants/semantic-elevation';

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

function mountComposer(
  props: Partial<{
    modelValue: string;
    loading: boolean;
    canSend: boolean;
    attachments: Array<{
      id: string;
      data: string;
      mediaType: string;
      filename?: string;
      size: number;
    }>;
    contextEntities: Array<{
      entityType: 'goal' | 'task' | 'knowledge_document';
      id: string;
      label: string;
      origin: 'explicit' | 'surface';
    }>;
    recentGoals: Array<{
      id: string;
      title: string;
      status: string;
      updatedAt: number;
      progress: number | null;
    }>;
    recentTasks: Array<{ id: string; title: string; updatedAt: number }>;
    recentKnowledgeNotes: Array<{ id: string; title: string; path: string; updatedAt: number }>;
    modelGroups: Array<{
      providerId: string;
      providerName: string;
      models: Array<{ key: string; modelName: string }>;
    }>;
    selectedModelKey: string;
    density: 'comfortable' | 'compact' | 'icon';
  }> = {},
) {
  return mount(AIFooterComposer, {
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
}

describe('AIFooterComposer (Global Composer input)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses floating composer elevation and inset context chips while preserving removal events', async () => {
    const wrapper = mountComposer({
      attachments: [
        { id: 'a1', data: 'data:image/png;base64,AAAA', mediaType: 'image/png', size: 4 },
      ],
      contextEntities: [{ entityType: 'task', id: 't1', label: 'Review', origin: 'explicit' }],
    });

    expect(wrapper.get('[data-testid="ai-composer-surface"]').classes()).toContain(
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

  it('sends on Enter and keeps Shift+Enter as newline', async () => {
    const wrapper = mountComposer({ modelValue: 'hello' });
    const textarea = wrapper.get('[data-testid="ai-chat-composer"]');

    await textarea.trigger('keydown', { key: 'Enter', shiftKey: false });
    expect(wrapper.emitted('send')).toHaveLength(1);

    await textarea.trigger('keydown', { key: 'Enter', shiftKey: true });
    expect(wrapper.emitted('send')).toHaveLength(1);
    wrapper.unmount();
  });

  it('does not send while IME composition is active', async () => {
    const wrapper = mountComposer({ modelValue: '你好' });
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
    const wrapper = mountComposer({ loading: true, modelValue: 'next' });
    const textarea = wrapper.get('[data-testid="ai-chat-composer"]');
    expect((textarea.element as HTMLTextAreaElement).disabled).toBe(false);
    await textarea.setValue('next message');
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
    const loading = mountComposer({ loading: true, modelValue: 'x' });
    await loading.get('[data-testid="ai-chat-stop-generating"]').trigger('click');
    expect(loading.emitted('stop')).toHaveLength(1);
    expect(loading.find('[data-testid="ai-chat-send-message"]').exists()).toBe(false);
    loading.unmount();

    const idle = mountComposer({ loading: false, modelValue: 'x' });
    await idle.get('[data-testid="ai-chat-send-message"]').trigger('click');
    expect(idle.emitted('send')).toHaveLength(1);
    idle.unmount();
  });

  it('disables send when empty or canSend is false', () => {
    const empty = mountComposer({ modelValue: '   ' });
    expect(
      (empty.get('[data-testid="ai-chat-send-message"]').element as HTMLButtonElement).disabled,
    ).toBe(true);
    empty.unmount();

    const blocked = mountComposer({ modelValue: 'hi', canSend: false });
    expect(
      (blocked.get('[data-testid="ai-chat-send-message"]').element as HTMLButtonElement).disabled,
    ).toBe(true);
    blocked.unmount();
  });

  it('shows a compact empty-models configuration control', () => {
    const wrapper = mountComposer({ modelGroups: [] });
    expect(wrapper.find('[data-testid="ai-chat-empty-models"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('auto-grows textarea height up to the max cap', async () => {
    const wrapper = mountComposer({ modelValue: '' });
    const el = wrapper.get('[data-testid="ai-chat-composer"]').element as HTMLTextAreaElement;
    Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => 320 });
    await wrapper.setProps({ modelValue: 'line\n'.repeat(20) });
    await nextTick();
    // height is clamped by COMPOSER_TEXTAREA_MAX_PX (168)
    expect(el.style.height).toBe('168px');
    wrapper.unmount();
  });

  it('keeps the draft editable while AI is unavailable', () => {
    const wrapper = mountComposer({
      modelGroups: [],
      canSend: false,
      selectedModelKey: '',
    });

    expect(
      (wrapper.get('[data-testid="ai-chat-composer"]').element as HTMLTextAreaElement).disabled,
    ).toBe(false);
    wrapper.unmount();
  });

  it('removes the manual intent selector and exposes one add-context control instead', () => {
    const wrapper = mountComposer({
      modelGroups: [],
      canSend: false,
      selectedModelKey: '',
    });

    expect(wrapper.find('[data-testid="ai-chat-tool-menu-trigger"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="ai-chat-add-context"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="ai-chat-empty-models"]').exists()).toBe(true);

    const cueText = wrapper.find('[data-testid="ai-chat-empty-models"]').text();
    expect(cueText).not.toMatch(/aiAssistant\.chatPage/);
    expect(cueText.length).toBeGreaterThan(0);

    wrapper.unmount();
  });

  it('allows attachment-only submit and emits pasted files', async () => {
    const wrapper = mountComposer({
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
    const wrapper = mountComposer();
    const screenshot = new File(['png'], 'clipboard.png', { type: 'image/png' });

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
    const wrapper = mountComposer({
      modelValue: 'compare @Ship',
      recentGoals: [
        { id: 'g1', title: 'Ship v1', status: 'InProgress', updatedAt: 10, progress: 20 },
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
    const textarea = wrapper.get('[data-testid="ai-chat-composer"]');
    const textareaEl = textarea.element as HTMLTextAreaElement;
    textareaEl.setSelectionRange(textareaEl.value.length, textareaEl.value.length);
    await textarea.trigger('keyup');
    await nextTick();

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
    wrapper.unmount();
  });

  it('renders explicit entity chips as removable context', async () => {
    const wrapper = mountComposer({
      contextEntities: [{ entityType: 'goal', id: 'g1', label: 'Ship v1', origin: 'explicit' }],
    });

    expect(wrapper.get('[data-testid="ai-composer-entity-chip"]').text()).toContain('Ship v1');
    const chipButton = wrapper.get('[data-testid="ai-composer-entity-chip"] button');
    await chipButton.trigger('click');
    expect(wrapper.emitted('remove-context-entity')?.[0]).toEqual(['goal', 'g1']);
    wrapper.unmount();
  });
});
