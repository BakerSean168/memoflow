import type { AIContextEntityType } from '@memoflow/contracts/ai';

/**
 * Owner-projected context for an explicitly selected product entity.
 *
 * The AI package owns only this narrow read contract. Host lanes resolve Goal /
 * Task owner read models and return a bounded projection; the runtime then adds
 * it to the canonical AI context envelope as authoritative domain data.
 */
export interface AISelectedEntityContextProjection {
  readonly source: string;
  readonly content: unknown;
}

export interface AISelectedEntityContextReadInput {
  readonly identityId: string;
  readonly entityType: AIContextEntityType;
  readonly id: string;
}

export interface IAISelectedEntityContextReadPort {
  getSelectedEntityContext(
    input: AISelectedEntityContextReadInput,
  ): Promise<AISelectedEntityContextProjection | null>;
}
