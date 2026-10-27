import {
  type KnowledgeCaptureSource,
  type KnowledgeDraft,
  type KnowledgeNoteDraftContent,
} from '@memoflow/ai-contracts';
import type { OwnerNativeEditSession } from '@memoflow/task-client';

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
