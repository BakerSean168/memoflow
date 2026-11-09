import type { ArchiveManifest } from '@memoflow/data-portability-contracts';
import {
  computeArchiveManifest,
  computeThreadManifestEntry,
  type ArchiveLineV1,
  type ArchiveMessageLineV1,
} from '@memoflow/ai-contracts/portable-messages-archive';
import type { AiMessageStore } from './message-store.prisma';

export interface AiMessageArchiveView {
  readonly manifest: ArchiveManifest;
  /** Thread line followed by that thread's message lines, refs sorted. */
  readonly lines: readonly ArchiveLineV1[];
  readonly threadIds: readonly string[];
}

export interface AiMessageArchiveReadOptions {
  /**
   * `auto` is the export path; `readback` is the commit-time L3 path and fails
   * unless at least one imported conversation reference is bound.
   */
  readonly mode?: 'auto' | 'readback';
  readonly resolveExportReference: (threadId: string) => string;
  readonly isImportedThread: (threadId: string, ref: string) => boolean;
}

export interface AiMessageExportReader {
  readArchive(
    identityId: string,
    options: AiMessageArchiveReadOptions,
  ): Promise<AiMessageArchiveView>;
}

export function createAiMessageExportReader(store: AiMessageStore): AiMessageExportReader {
  return {
    readArchive: (identityId, options) => readAiMessageArchive(store, identityId, options),
  };
}

/**
 * Service-side export read port.
 *
 * Reads only threads that still own a live conversation shell, projects only
 * the archive columns, orders messages by `createdAt, id`, and numbers ordinal
 * after that order. Digests are computed by the shared canonicalizer.
 */
export async function readAiMessageArchive(
  store: AiMessageStore,
  identityId: string,
  options: AiMessageArchiveReadOptions,
): Promise<AiMessageArchiveView> {
  const liveThreads = await store.listLiveThreads(identityId);
  const resolved = liveThreads.map((thread) => ({
    thread,
    ref: options.resolveExportReference(thread.id),
  }));

  const imported = resolved.filter(({ thread, ref }) => options.isImportedThread(thread.id, ref));
  const readback = options.mode === 'readback' || imported.length > 0;
  if (options.mode === 'readback' && imported.length === 0) {
    throw new Error('No imported conversation reference is bound for message readback');
  }

  const selected = readback ? imported : resolved;
  if (readback) {
    const owned = await store.listOwnedThreadIds(identityId);
    const selectedIds = new Set(selected.map(({ thread }) => thread.id));
    if (owned.length !== selectedIds.size || owned.some((id) => !selectedIds.has(id))) {
      throw new Error('Target thread set does not match the imported conversation set');
    }
  }

  const ordered = [...selected].sort((left, right) => {
    if (left.ref < right.ref) return -1;
    if (left.ref > right.ref) return 1;
    return 0;
  });

  const entries = [];
  const lines: ArchiveLineV1[] = [];
  const threadIds: string[] = [];

  for (const { thread, ref } of ordered) {
    const messages = await store.readThreadMessages(thread.id);
    // Source export carries conversations that have messages; an empty shell is
    // not a transcript fact. Readback keeps imported threads so count/digest
    // mismatches cannot be hidden by skipping them.
    if (!readback && messages.length === 0) continue;

    const messageLines: ArchiveMessageLineV1[] = messages.map((message, ordinal) => ({
      k: 'message',
      v: 1,
      ref,
      ordinal,
      sid: message.id,
      role: message.role,
      type: message.type,
      content: message.content,
      createdAt: message.createdAt.getTime(),
    }));

    lines.push({
      k: 'thread',
      v: 1,
      ref,
      createdAt: thread.createdAt.getTime(),
      updatedAt: thread.updatedAt.getTime(),
    });
    lines.push(...messageLines);
    entries.push(computeThreadManifestEntry(ref, messageLines));
    threadIds.push(thread.id);
  }

  return {
    manifest: computeArchiveManifest(entries),
    lines,
    threadIds,
  };
}
