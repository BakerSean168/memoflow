import { LabelColorSchema, type LabelColor, type LabelDto } from '@memoflow/contracts/label';
import type { Instant } from '@memoflow/contracts/primitives';

const MAX_LABEL_NAME_LENGTH = 50;

export function normalizeLabelName(name: string): string {
  return name.trim().normalize('NFKC').toLowerCase();
}

export function validateLabelName(name: string): { name: string; normalizedName: string } {
  const trimmed = name.trim().normalize('NFKC');
  if (!trimmed) throw new TypeError('Label name must not be empty.');
  if (trimmed.length > MAX_LABEL_NAME_LENGTH) {
    throw new TypeError(`Label name must be at most ${MAX_LABEL_NAME_LENGTH} characters.`);
  }
  return { name: trimmed, normalizedName: normalizeLabelName(trimmed) };
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
