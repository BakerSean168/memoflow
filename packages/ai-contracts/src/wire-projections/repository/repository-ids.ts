// ==========================================
// Strong-typed IDs — Knowledge / Repository domain
// 知识库域强类型 ID 定义（自 @memoflow/shared-primitives 迁回，#630 §4.7）
// ==========================================

/** Stable managed knowledge document ID carried by Markdown frontmatter. */
export type KnowledgeDocumentId = string & {
  readonly __brand: 'KnowledgeDocumentId';
};

/** Knowledge logical space ID */
export type KnowledgeSpaceId = string & {
  readonly __brand: 'KnowledgeSpaceId';
};

/** Desktop Local Vault binding ID */
export type LocalVaultBindingId = string & {
  readonly __brand: 'LocalVaultBindingId';
};

/** Cloud/remote knowledge source binding ID */
export type KnowledgeRemoteBindingId = string & {
  readonly __brand: 'KnowledgeRemoteBindingId';
};

/** 仓库 ID */
export type RepositoryId = string & { readonly __brand: 'RepositoryId' };

/** 资源 ID */
export type ResourceId = string & { readonly __brand: 'ResourceId' };

/** 文件夹 ID */
export type FolderId = string & { readonly __brand: 'FolderId' };

/** 资源版本 ID */
export type ResourceVersionId = string & {
  readonly __brand: 'ResourceVersionId';
};

/** 资源链接 ID */
export type ResourceLinkId = string & { readonly __brand: 'ResourceLinkId' };

/** 资源书签 ID */
export type BookmarkId = string & { readonly __brand: 'BookmarkId' };
