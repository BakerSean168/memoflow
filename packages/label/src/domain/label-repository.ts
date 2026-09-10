import type { LabelColor } from '@memoflow/contracts/label';
import type { Instant } from '@memoflow/contracts/primitives';
import type { LabelRecord, NewLabelRecord } from './label';

export interface LabelListOptions {
  readonly identityId: string;
  readonly normalizedSearch?: string | null;
  readonly limit?: number;
}

/** Identity-owned Shared Label registry persistence (ADR-102 / LABEL-1302). */
export interface LabelRepository {
  create(record: NewLabelRecord): Promise<LabelRecord>;
  update(input: {
    identityId: string;
    labelId: string;
    name?: string;
    normalizedName?: string;
    color?: LabelColor | null;
    updatedAt: Instant;
  }): Promise<LabelRecord | null>;
  delete(identityId: string, labelId: string): Promise<boolean>;
  findById(identityId: string, labelId: string): Promise<LabelRecord | null>;
  findByNormalizedNames(
    identityId: string,
    normalizedNames: readonly string[],
  ): Promise<LabelRecord[]>;
  list(options: LabelListOptions): Promise<LabelRecord[]>;
}
