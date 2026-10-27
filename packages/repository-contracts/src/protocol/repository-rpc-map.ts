/**
 * Repository Module RPC Map
 *
 * Legacy database Repository/Resource/Folder/Bookmark mitt-style RPC entries
 * were removed with the CRUD runtime. Live Desktop IPC uses
 * `RepositoryChannels` (knowledge connection + local vault) instead.
 */
export type RepositoryRpcMap = Record<string, never>;
