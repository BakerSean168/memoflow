/** @vitest-environment happy-dom */

import { ref } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { productionLocaleMessages } from '../../../locales/production-messages';
import NoteCapsulePreview from './NoteCapsulePreview.vue';

const notesRef = ref<
  Array<{
    id: string;
    title: string;
    path: string;
    knowledgeDocumentId: string | null;
    updatedAt: number;
    source: 'projection' | 'local-vault';
  }>
>([]);
const errorRef = ref<string | null>(null);
const errorMessageKeyRef = ref<string | null>(null);
const emailVerificationRequiredRef = ref(false);
const isLoadingRef = ref(false);
const load = vi.fn().mockResolvedValue(undefined);
const ensure = vi.fn().mockResolvedValue(undefined);

vi.mock('../../../modules/repository/composables/useRecentKnowledgeNotes', () => ({
  useRecentKnowledgeNotes: () => ({
    notes: notesRef,
    error: errorRef,
    errorMessageKey: errorMessageKeyRef,
    emailVerificationRequired: emailVerificationRequiredRef,
    isLoading: isLoadingRef,
    load,
    ensure,
  }),
}));

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: productionLocaleMessages,
});

function mountPreview() {
  return mount(NoteCapsulePreview, { global: { plugins: [i18n] } });
}

describe('NoteCapsulePreview', () => {
  afterEach(() => {
    notesRef.value = [];
    errorRef.value = null;
    errorMessageKeyRef.value = null;
    emailVerificationRequiredRef.value = false;
    isLoadingRef.value = false;
    vi.clearAllMocks();
  });

  it('loads recent knowledge notes and emits view-all', async () => {
    notesRef.value = [
      {
        id: 'n1',
        title: 'Alpha',
        path: 'a.md',
        knowledgeDocumentId: 'doc-1',
        updatedAt: 200,
        source: 'projection',
      },
      {
        id: 'n2',
        title: 'Beta',
        path: 'b.md',
        knowledgeDocumentId: null,
        updatedAt: 100,
        source: 'projection',
      },
    ];
    const wrapper = mountPreview();
    await flushPromises();
    expect(ensure).toHaveBeenCalled();
    expect(wrapper.find('[data-testid="note-capsule-item-n1"]').exists()).toBe(true);
    await wrapper.get('[data-testid="note-capsule-view-all"]').trigger('click');
    expect(wrapper.emitted('view-all')).toBeTruthy();
    wrapper.unmount();
  });

  it('filters loaded notes inline without entering the Repository page', async () => {
    notesRef.value = [
      {
        id: 'n1',
        title: 'MemoFlow architecture',
        path: 'project/memoflow.md',
        knowledgeDocumentId: 'doc-1',
        updatedAt: 200,
        source: 'projection',
      },
      {
        id: 'n2',
        title: 'Interview notes',
        path: 'career/interview.md',
        knowledgeDocumentId: null,
        updatedAt: 100,
        source: 'projection',
      },
    ];
    const wrapper = mountPreview();
    await flushPromises();

    await wrapper.get('[data-testid="note-capsule-search"]').setValue('interview');
    expect(wrapper.find('[data-testid="note-capsule-item-n1"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="note-capsule-item-n2"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('shows empty state', async () => {
    const wrapper = mountPreview();
    await flushPromises();
    expect(wrapper.find('[data-testid="note-capsule-empty"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('renders explicit i18n email-verification degrade instead of raw error or empty', async () => {
    emailVerificationRequiredRef.value = true;
    errorMessageKeyRef.value = 'errors.EMAIL_VERIFICATION_REQUIRED';
    errorRef.value = 'Email verification is required before continuing.';
    notesRef.value = [];

    const wrapper = mountPreview();
    await flushPromises();

    const degrade = wrapper.find('[data-testid="note-capsule-email-verification"]');
    expect(degrade.exists()).toBe(true);
    expect(wrapper.find('[data-testid="note-capsule-empty"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="note-capsule-error"]').exists()).toBe(false);

    const text = degrade.text();
    expect(text).not.toMatch(/errors\.EMAIL_VERIFICATION|shell\.preview\.noteEmpty/);
    expect(text.toLowerCase()).toMatch(/email|verif/);
    // Production en-US message from real locale tree
    expect(text).toContain(productionLocaleMessages['en-US'].errors.EMAIL_VERIFICATION_REQUIRED);

    wrapper.unmount();
  });
});
