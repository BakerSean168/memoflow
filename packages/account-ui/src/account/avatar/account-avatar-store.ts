/**
 * Platform-owned avatar persistence port (Issue #858).
 *
 * Desktop writes into the active Profile's data directory through IPC; the web
 * shell keeps the same normalized PNG in browser storage keyed by account. The
 * shared components only see this port, so neither surface owns a file layout.
 */
export interface AccountAvatarStore {
  /** Current avatar as a renderable URL, or null when the account has none. */
  load(accountKey: string | null): Promise<string | null>;
  /** Persist an already-normalized PNG and return its renderable URL. */
  save(accountKey: string | null, image: Blob): Promise<string>;
}
