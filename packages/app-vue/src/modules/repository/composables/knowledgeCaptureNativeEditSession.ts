import {
  KnowledgeCaptureSourceSchema,
  KnowledgeNoteDraftContentSchema,
  type KnowledgeCaptureSource,
  type KnowledgeDraft,
  type KnowledgeNoteDraftContent,
} from '@memoflow/contracts/ai';
import type { OwnerNativeEditSession } from '../../../shared/composables/ownerNativeEditSession';

export type KnowledgeCaptureNativeDraft = KnowledgeNoteDraftContent & {
  source?: KnowledgeCaptureSource;
};

export type KnowledgeCaptureNativePatch = Partial<KnowledgeCaptureNativeDraft>;

export interface KnowledgeCaptureNativeDraftState {
  draft: KnowledgeCaptureNativeDraft;
  dirty: boolean;
  busy: boolean;
}

export interface KnowledgeCaptureNativeSubmitContext {
  expectedDraft: KnowledgeCaptureNativeDraft;
}

export interface KnowledgeCaptureSourceOption {
  key: string;
  label: string;
  source: KnowledgeCaptureSource;
}

export function knowledgeCaptureSourceKey(source: KnowledgeCaptureSource): string {
  return source.kind === 'repository' ? `repository:${source.connectionId}` : 'local_vault';
}

export function parseKnowledgeCaptureNativeDraft(
  draft: KnowledgeCaptureNativeDraft,
): KnowledgeCaptureNativeDraft {
  const { source: selectedSource, ...draftContent } = draft;
  const content = KnowledgeNoteDraftContentSchema.parse(draftContent);
  const source = KnowledgeCaptureSourceSchema.parse(selectedSource);
  return { ...content, source };
}

export function nativeDraftFromKnowledgeDraft(draft: KnowledgeDraft): KnowledgeCaptureNativeDraft {
  const {
    knowledgeDocumentId: _knowledgeDocumentId,
    revision: _revision,
    source,
    ...content
  } = draft;
  return {
    ...KnowledgeNoteDraftContentSchema.parse(content),
    ...(source ? { source } : {}),
  };
}

/**
 * Repository-owned review session for knowledge.capture.
 *
 * requestSubmit validates and returns the owner-reviewed snapshot only. It never persists
 * Knowledge content; durable mutation remains behind the host-bound workflow persistence port.
 */
export type KnowledgeCaptureNativeEditSession = Pick<
  OwnerNativeEditSession<
    KnowledgeCaptureNativePatch,
    never,
    never,
    'title' | 'markdown' | 'targetSubpath' | 'source',
    KnowledgeCaptureNativeDraftState,
    KnowledgeCaptureNativeSubmitContext,
    KnowledgeCaptureNativeDraft | null
  >,
  'patch' | 'focus' | 'readDraftState' | 'requestSubmit' | 'requestCancel'
> & {
  projectDraft(draft: KnowledgeDraft): void;
  coordinateSubmit(submit: () => Promise<void>, cancel: () => Promise<void>): void;
  setEditingBlocked(blocked: boolean): void;
};
