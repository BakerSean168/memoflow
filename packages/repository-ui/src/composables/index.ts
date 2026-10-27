export { useLocalVault } from './useLocalVault';
export { useRecentKnowledgeNotes } from './useRecentKnowledgeNotes';
export type { RecentKnowledgeNote } from './useRecentKnowledgeNotes';
export { useReferenceableKnowledgeNotes } from './useReferenceableKnowledgeNotes';
export type {
  ReferenceableKnowledgeNote,
  ReferenceableKnowledgeNoteQuery,
} from './useReferenceableKnowledgeNotes';
export { useKnowledgeWriteRequestLedger } from './useKnowledgeWriteRequestLedger';
export { openLocalAgentNoteReview } from './local-agent-note-review';
export {
  knowledgeCaptureSourceKey,
  nativeDraftFromKnowledgeDraft,
  parseKnowledgeCaptureNativeDraft,
  type KnowledgeCaptureNativeDraft,
  type KnowledgeCaptureNativeDraftState,
  type KnowledgeCaptureNativeEditSession,
  type KnowledgeCaptureNativePatch,
  type KnowledgeCaptureNativeSubmitContext,
  type KnowledgeCaptureSourceOption,
} from './knowledge-capture-native-edit-session';
