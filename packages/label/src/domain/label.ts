import { LabelColorSchema, type LabelColor, type LabelDto } from '@memoflow/contracts/label';
import type { Instant } from '@memoflow/contracts/primitives';

const MAX_LABEL_NAME_LENGTH = 50;

export function normalizeLabelName(name: string): string {
  return name.normalize('NFKC').trim().toLowerCase();
}

export function validateLabelName(name: string): { name: string; normalizedName: string } {
  const normalized = name.normalize('NFKC').trim();
  if (!normalized) throw new TypeError('Label name must not be empty.');
  if (normalized.length > MAX_LABEL_NAME_LENGTH) {
    throw new TypeError(`Label name must be at most ${MAX_LABEL_NAME_LENGTH} characters.`);
  }
  return { name: normalized, normalizedName: normalizeLabelName(normalized) };
}

export function normalizeLabelColor(color: string | null | undefined): LabelColor | null {
  return color == null ? null : LabelColorSchema.parse(color);
}

export interface LabelRecord extends LabelDto {}

export interface NewLabelRecord {
  readonly id: string;
  readonly identityId: string;
  readonly name: string;
  readonly normalizedName: string;
  readonly color: LabelColor | null;
  readonly createdAt: Instant;
  readonly updatedAt: Instant;
}
