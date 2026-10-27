import {
  GoalDraftCheckpointContentSchema,
  GoalDraftCheckpointSnapshotSchema,
  type GoalDraftCheckpointContent,
  type GoalDraftCheckpointSnapshot,
} from '@memoflow/goal-contracts';

export interface GoalDraftCheckpointStore {
  scope(): string | null;
  load(scope: string): Promise<GoalDraftCheckpointSnapshot>;
  write(
    scope: string,
    expectedVersion: number,
    content: GoalDraftCheckpointContent | null,
  ): Promise<GoalDraftCheckpointSnapshot>;
}
export class GoalDraftCheckpointConflict extends Error {
  constructor(readonly current: GoalDraftCheckpointSnapshot) {
    super('Goal draft changed in another window');
  }
}

/** Offline checkpoints live in this browser/Profile. No draft is a formal Goal. */
export function createGoalDraftCheckpointStore(
  scope: () => string | null,
): GoalDraftCheckpointStore {
  let opening: Promise<IDBDatabase> | undefined;
  const database = () =>
    (opening ??= new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('Draft storage unavailable'));
        return;
      }
      let settled = false;
      const request = indexedDB.open('memoflow-goal-drafts', 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('checkpoints', { keyPath: 'scope' });
      };
      request.onerror = () => {
        settled = true;
        reject(new Error('Draft storage unavailable'));
      };
      request.onblocked = () => {
        settled = true;
        reject(new Error('Draft storage is busy'));
      };
      request.onsuccess = () => {
        const db = request.result;
        if (settled) {
          db.close();
          return;
        }
        settled = true;
        db.onversionchange = () => {
          db.close();
          opening = undefined;
        };
        resolve(db);
      };
    }).catch((error: unknown) => {
      opening = undefined;
      throw error;
    }));
  const assertScope = (expected: string) => {
    if (!expected || scope() !== expected) throw new Error('Draft identity changed');
  };
  const transact = async (
    identityScope: string,
    expectedVersion?: number,
    content?: GoalDraftCheckpointContent | null,
  ): Promise<GoalDraftCheckpointSnapshot> => {
    assertScope(identityScope);
    const validated =
      content === undefined
        ? undefined
        : content === null
          ? null
          : GoalDraftCheckpointContentSchema.parse(content);
    const db = await database();
    assertScope(identityScope);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(
        'checkpoints',
        expectedVersion === undefined ? 'readonly' : 'readwrite',
      );
      const store = tx.objectStore('checkpoints');
      let failure: unknown;
      let result: GoalDraftCheckpointSnapshot;
      const request = store.get(identityScope);
      request.onsuccess = () => {
        try {
          assertScope(identityScope);
          const current =
            request.result === undefined
              ? { scope: identityScope, version: 0, content: null }
              : GoalDraftCheckpointSnapshotSchema.parse(request.result);
          if (current.scope !== identityScope) throw new Error('Invalid draft identity');
          if (expectedVersion === undefined) result = current;
          else {
            if (current.version !== expectedVersion) throw new GoalDraftCheckpointConflict(current);
            result = GoalDraftCheckpointSnapshotSchema.parse({
              scope: identityScope,
              version: current.version + 1,
              content: validated,
            });
            // Keep a versioned tombstone on discard: deletion must not reset CAS to zero.
            store.put(result);
          }
        } catch (error) {
          failure = error;
          tx.abort();
        }
      };
      tx.oncomplete = () => {
        try {
          assertScope(identityScope);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      };
      tx.onabort = tx.onerror = () => reject(failure ?? new Error('Draft storage unavailable'));
    });
  };
  return {
    scope,
    load: (identityScope) => transact(identityScope),
    write: (identityScope, version, content) => transact(identityScope, version, content),
  };
}
