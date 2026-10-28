/**
 * Owner-native surface registration. The session contract itself has a single
 * declaration in `@memoflow/task-client`; only the renderer-side surface shape
 * lives here.
 */
export interface OwnerNativeEditSurface<Session> {
  openCreate(): Promise<Session>;
  openExisting(id: string): Promise<Session>;
  locate(): Session | null;
}
