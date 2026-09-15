export interface KnowledgeIndexStatusUpdate {
  repositoryId: string;
  resourceId: string;
  contentHash: string;
  status: 'indexed' | 'failed';
}

/**
 * Reports an indexing outcome to the host-owned source projection.
 * Implementations must compare contentHash before updating so a late result
 * cannot mark a newer source revision as indexed.
 */
export interface IKnowledgeIndexStatusPort {
  updateIndexStatus(identityId: string, update: KnowledgeIndexStatusUpdate): Promise<void>;
}
