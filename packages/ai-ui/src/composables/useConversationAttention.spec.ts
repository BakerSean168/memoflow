import { installAiUiHost } from '@ai-ui-test-host/di/ai-ui-host';
installAiUiHost();
/** @vitest-environment happy-dom */
import { defineComponent, h, nextTick, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import {
  deriveLiveConversationAttention,
  useConversationAttention,
} from './useConversationAttention';
import type { ChatItem } from './types';

function message(status: ChatItem['status'] = 'generating'): ChatItem {
  return { id: 'assistant-1', role: 'assistant', content: 'Answer', status };
}

function createHarness(isVisible: () => boolean = () => true) {
  const conversationId = ref('one');
  const loading = ref(false);
  const timeline = ref<ChatItem[]>([]);
  let attention!: ReturnType<typeof useConversationAttention>;
  const wrapper = mount(
    defineComponent({
      setup() {
        attention = useConversationAttention({
          conversationId,
          loading,
          timeline,
          isVisible,
        });
        return () => h('div');
      },
    }),
  );
  return { conversationId, loading, timeline, attention, wrapper };
}

describe('conversation attention projection', () => {
  it('shows recoverable interruption as attention and keeps unconfirmed execution distinct', () => {
    const current = message('interrupted');
    current.workflowInterruption = {
      draftPreserved: true,
      confirmation: 'stopped',
    };
    expect(deriveLiveConversationAttention(false, [current])).toBe('failed');
    current.workflowInterruption.confirmation = 'unconfirmed';
    expect(deriveLiveConversationAttention(false, [current])).toBe('input');
  });
  it('prioritizes approval over input, failure and working and hides ordinary success', () => {
    const current = message('generating');
    expect(deriveLiveConversationAttention(true, [current])).toBe('working');
    current.nativeRequests = [{ status: 'pending' } as never];
    expect(deriveLiveConversationAttention(true, [current])).toBe('input');
    current.approvals = [{ status: 'pending' } as never];
    expect(deriveLiveConversationAttention(true, [current])).toBe('approval');
    current.approvals[0]!.status = 'approved';
    expect(deriveLiveConversationAttention(true, [current])).toBe('input');
    current.nativeRequests[0]!.status = 'answered';
    current.status = 'error';
    expect(deriveLiveConversationAttention(true, [current])).toBe('failed');
    current.status = 'success';
    expect(deriveLiveConversationAttention(false, [current])).toBeNull();
  });

  it('is driven by the current stream, and does not synthesize history-list statuses', () => {
    const f = createHarness();
    expect(f.attention.statuses.value).toEqual({});
    f.timeline.value = [message()];
    f.loading.value = true;
    expect(f.attention.statuses.value.one).toBe('working');
    f.timeline.value[0]!.approvals = [{ status: 'pending' } as never];
    expect(f.attention.statuses.value.one).toBe('approval');
    f.timeline.value[0]!.approvals[0]!.status = 'approved';
    f.timeline.value[0]!.nativeRequests = [{ status: 'sending' } as never];
    expect(f.attention.statuses.value.one).toBe('input');
    f.timeline.value[0]!.nativeRequests[0]!.status = 'answered';
    f.timeline.value[0]!.status = 'error';
    f.loading.value = false;
    expect(f.attention.statuses.value.one).toBe('failed');
    f.timeline.value.push(message('generating'));
    f.loading.value = true;
    expect(f.attention.statuses.value.one).toBe('working');
    f.timeline.value.at(-1)!.status = 'success';
    f.loading.value = false;
    expect(f.attention.statuses.value.one).toBeUndefined();
    f.wrapper.unmount();
  });

  it('shows Done only for an unseen successful result and acknowledges on focus', async () => {
    let visible = false;
    const f = createHarness(() => visible);
    f.timeline.value = [message()];
    f.loading.value = true;
    f.timeline.value[0]!.status = 'success';
    f.loading.value = false;
    expect(f.attention.statuses.value.one).toBe('done');
    visible = true;
    window.dispatchEvent(new Event('focus'));
    await nextTick();
    expect(f.attention.statuses.value.one).toBeUndefined();
    f.wrapper.unmount();
  });

  it('does not leak previous conversation failures while new history is loading', () => {
    const f = createHarness();
    f.timeline.value = [message('error')];
    expect(f.attention.statuses.value.one).toBe('failed');
    f.conversationId.value = 'two';
    expect(f.attention.statuses.value.two).toBeUndefined();
    f.timeline.value = [message('success')];
    expect(f.attention.statuses.value.two).toBeUndefined();
    f.wrapper.unmount();
  });

  it('does not leave Working after switching away from an aborted stream', () => {
    const f = createHarness();
    f.timeline.value = [message()];
    f.loading.value = true;
    expect(f.attention.statuses.value.one).toBe('working');
    f.conversationId.value = 'two';
    f.timeline.value = [];
    f.loading.value = false;
    expect(f.attention.statuses.value.one).toBeUndefined();
    expect(f.attention.statuses.value.two).toBeUndefined();
    f.wrapper.unmount();
  });

  it('does not mistake an aborted or incomplete stream for a new result', () => {
    const f = createHarness(() => false);
    f.timeline.value = [message('generating')];
    f.loading.value = true;
    f.timeline.value[0]!.status = 'aborted';
    f.loading.value = false;
    expect(f.attention.statuses.value.one).toBeUndefined();
    f.timeline.value = [message('generating')];
    f.loading.value = true;
    f.loading.value = false;
    expect(f.attention.statuses.value.one).toBeUndefined();
    f.wrapper.unmount();
  });
});
