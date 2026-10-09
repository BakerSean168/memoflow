import { expect, it, vi } from 'vitest';
import type {
  KnowledgeCaptureNativeEditSession,
  KnowledgeCaptureNativeDraft,
} from './knowledgeCaptureNativeEditSession';
import { openLocalAgentNoteReview } from './localAgentNoteReview';

it('opens the existing owner editor and saves only the exact user-confirmed draft', async () => {
  let draft: KnowledgeCaptureNativeDraft = {
    title: '',
    topic: '',
    markdown: '',
    targetSubpath: '',
    tags: [],
    duplicateRisk: '',
    source: { kind: 'local_vault' },
  };
  let submit!: () => Promise<void>;
  const session: KnowledgeCaptureNativeEditSession = {
    patch: (patch) => {
      draft = { ...draft, ...patch };
    },
    projectDraft: (value) => {
      draft = value;
    },
    focus: async () => {},
    readDraftState: () => ({ draft, dirty: true, busy: false }),
    requestSubmit: async (context) => {
      expect(context?.expectedDraft).toEqual(draft);
      return draft;
    },
    requestCancel: vi.fn(),
    coordinateSubmit: (handler) => {
      submit = handler;
    },
    setEditingBlocked: vi.fn(),
  };
  const persist = vi.fn(async () => ({
    note: { knowledgeDocumentId: 'kdoc_00000000-0000-4000-8000-000000000001' },
  }));
  await openLocalAgentNoteReview({
    content: 'Agent draft',
    surface: { openCreate: async () => session, locate: () => session },
    bindingId: 'binding',
    currentBindingId: async () => 'binding',
    persist,
    onSaved: async () => {},
  });
  expect(persist).not.toHaveBeenCalled();
  draft = {
    ...draft,
    title: 'Reviewed',
    markdown: 'User edited content',
    targetSubpath: 'notes/reviewed.md',
  };
  await submit();
  expect(persist).toHaveBeenCalledWith(
    expect.objectContaining({
      contentMarkdown: 'User edited content',
      relativePath: 'notes/reviewed.md',
      expectedBindingId: 'binding',
      proposalRevision: 1,
    }),
  );
  expect(session.requestCancel).toHaveBeenCalledOnce();
});

it('rejects confirmation after the selected Vault or owner editor changes', async () => {
  let submit!: () => Promise<void>;
  const session: KnowledgeCaptureNativeEditSession = {
    patch: () => {},
    projectDraft: () => {},
    focus: async () => {},
    readDraftState: () => {
      throw new Error('Must not read stale editor');
    },
    requestSubmit: async () => null,
    requestCancel: () => {},
    coordinateSubmit: (handler) => {
      submit = handler;
    },
    setEditingBlocked: () => {},
  };
  const persist = vi.fn();
  await openLocalAgentNoteReview({
    content: 'Draft',
    surface: { openCreate: async () => session, locate: () => session },
    bindingId: 'old',
    currentBindingId: async () => 'new',
    persist,
    onSaved: async () => {},
  });
  await expect(submit()).rejects.toThrow();
  expect(persist).not.toHaveBeenCalled();
});
