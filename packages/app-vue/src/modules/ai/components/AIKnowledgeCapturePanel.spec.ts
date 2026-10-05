import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { describe, expect, it } from 'vitest';
import AIKnowledgeCapturePanel from './AIKnowledgeCapturePanel.vue';

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      common: { cancel: 'Cancel' },
      repository: { capture: { openReview: 'Open Knowledge review' } },
      aiAssistant: {
        errors: { workflowExecutionFailed: 'Execution failed' },
        chatPage: { workflow: { knowledgeCaptureAwaitingApprovalHint: 'Review note' } },
        dialogs: {
          agent: { retry: 'Retry' },
          automation: { recoveryRetryReady: 'Fix the issue and retry.' },
        },
      },
    },
  },
});

describe('AIKnowledgeCapturePanel', () => {
  it('keeps raw stable identity out of the normal panel and opens native Repository review', async () => {
    const documentId = 'kdoc_550e8400-e29b-41d4-a716-446655440530';
    const wrapper = mount(AIKnowledgeCapturePanel, {
      global: { plugins: [i18n] },
      props: {
        toolMode: 'knowledge-capture',
        knowledgeCaptureRun: {
          runId: 'run-review',
          conversationId: 'conv-review',
          kind: 'knowledge.capture',
          status: 'suspended',
          createdAt: 1,
          updatedAt: 2,
          suspension: {
            type: 'knowledge_draft_review',
            revision: 1,
            warnings: [],
            draft: {
              revision: 1,
              knowledgeDocumentId: documentId,
              title: 'Stable identity',
              topic: 'Review stable identity',
              markdown: '# Stable identity',
              targetSubpath: 'Notes/Stable.md',
              tags: [],
              duplicateRisk: '',
            },
          },
        },
      },
    });

    expect(wrapper.text()).not.toContain(documentId);
    expect(wrapper.find('[data-testid="knowledge-capture-workflow-document-id"]').exists()).toBe(
      false,
    );
    await wrapper.get('[data-testid="knowledge-capture-open-native-review"]').trigger('click');
    expect(wrapper.emitted('open-native-review')).toHaveLength(1);
  });

  it('redacts raw knowledge persistence failure messages', () => {
    const wrapper = mount(AIKnowledgeCapturePanel, {
      global: { plugins: [i18n] },
      props: {
        toolMode: 'knowledge-capture',
        knowledgeCaptureRun: {
          runId: 'run-recovery',
          conversationId: 'conv-1',
          kind: 'knowledge.capture',
          status: 'suspended',
          createdAt: 1,
          updatedAt: 2,
          suspension: {
            type: 'recovery_required',
            message: 'token=internal-secret could not write note',
            retryable: true,
            failures: [
              {
                operation: 'knowledge_note',
                code: 'WRITE_FAILED',
                message: 'token=internal-secret could not write note',
                retryable: true,
              },
            ],
          },
        },
      },
    });

    expect(wrapper.text()).toContain('Fix the issue and retry.');
    expect(wrapper.text()).toContain('Execution failed (WRITE_FAILED)');
    expect(wrapper.text()).not.toContain('internal-secret');
  });
  it('keeps clarification display-only because the main Composer owns the answer', () => {
    const wrapper = mount(AIKnowledgeCapturePanel, {
      global: { plugins: [i18n] },
      props: {
        toolMode: 'knowledge-capture',
        knowledgeCaptureRun: {
          runId: 'clarify',
          conversationId: 'conv',
          kind: 'knowledge.capture',
          status: 'suspended',
          createdAt: 1,
          updatedAt: 1,
          suspension: { type: 'clarification_required', questions: ['Which topic?'] },
        },
      },
    });
    expect(wrapper.get('[data-testid="knowledge-capture-clarification"]').text()).toContain(
      'Which topic?',
    );
    expect(wrapper.find('textarea').exists()).toBe(false);
    expect(wrapper.find('[data-testid="knowledge-capture-submit-clarification"]').exists()).toBe(
      false,
    );
    expect(wrapper.emitted('update-clarification-answer')).toBeUndefined();
    expect(wrapper.emitted('submit-clarification')).toBeUndefined();
    expect(wrapper.text()).not.toContain('clarify');
    wrapper.unmount();
  });
});
