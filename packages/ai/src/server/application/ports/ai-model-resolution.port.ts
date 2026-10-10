import type { AIModelCapabilitySnapshot, AIModelCatalogSnapshot } from '@memoflow/contracts/ai';

export interface AIModelSelectionInput {
  readonly identityId: string;
  readonly agentInstanceId?: string;
  readonly providerId?: string;
  readonly modelId?: string;
}

/** Reuse the host's model catalog/capability policy without performing inference. */
export interface IAIModelSelectionValidationPort {
  assertModelSelection(input: AIModelSelectionInput): Promise<void>;
}

/** Input required to build a connection-owned model catalog projection. */
export interface AIModelCatalogSnapshotInput {
  readonly providerConnectionId: string;
  readonly baseUrl: string;
  /** Plaintext is present only at the request-scoped execution edge. */
  readonly credential: string;
  readonly now: number;
}

/** Canonical model catalog read seam used by ModelResolver. */
export interface IAIModelCatalogPort {
  getSnapshot(input: AIModelCatalogSnapshotInput): Promise<AIModelCatalogSnapshot>;
}

export interface AIModelCapabilitySnapshotInput {
  readonly providerConnectionId: string;
  readonly providerDefinitionId: string;
  readonly modelId: string;
  readonly now: number;
}

/**
 * Capability evidence is deliberately separate from ProviderConnection and
 * may be backed by an expiring cache, runtime probe, or manual verification.
 */
export interface IAIModelCapabilitySnapshotPort {
  getSnapshot(input: AIModelCapabilitySnapshotInput): Promise<AIModelCapabilitySnapshot | null>;
}
