import { LabelColorSchema } from '@memoflow/contracts/label';
import type { IElectronDatabase } from '@memoflow/contracts/electron';
import type { LabelRecord, NewLabelRecord } from '../../domain/label';
import type { LabelListOptions, LabelRepository } from '../../domain/label-repository';

interface LabelRow {
  id: string;
  identity_id: string;
  name: string;
  normalized_name: string;
  color: string | null;
  created_at: string;
  updated_at: string;
}

type LabelUpdateInput = Parameters<LabelRepository['update']>[0];

export class PowerSyncLabelRepository implements LabelRepository {
  constructor(private readonly db: IElectronDatabase) {}

  async create(record: NewLabelRecord): Promise<LabelRecord> {
    await this.db.execute(
      `INSERT INTO labels (id, identity_id, name, normalized_name, color, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        record.id,
        record.identityId,
        record.name,
        record.normalizedName,
        record.color,
        new Date(record.createdAt).toISOString(),
        new Date(record.updatedAt).toISOString(),
      ],
    );
    return record;
  }

  async update(input: LabelUpdateInput): Promise<LabelRecord | null> {
    const current = await this.findById(input.identityId, input.labelId);
    if (!current) return null;
    const next: LabelRecord = {
      ...current,
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.normalizedName !== undefined ? { normalizedName: input.normalizedName } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
      updatedAt: input.updatedAt,
    };
    await this.db.execute(
      `UPDATE labels SET name = ?, normalized_name = ?, color = ?, updated_at = ?
       WHERE id = ? AND identity_id = ?`,
      [
        next.name,
        next.normalizedName,
        next.color,
        new Date(next.updatedAt).toISOString(),
        input.labelId,
        input.identityId,
      ],
    );
    return next;
  }

  async delete(identityId: string, labelId: string): Promise<boolean> {
    const result = await this.db.execute('DELETE FROM labels WHERE id = ? AND identity_id = ?', [
      labelId,
      identityId,
    ]);
    return Number(result.rowsAffected ?? 0) > 0;
  }

  async findById(identityId: string, labelId: string): Promise<LabelRecord | null> {
    const row = await this.db.getOptional<LabelRow>(
      'SELECT * FROM labels WHERE id = ? AND identity_id = ? LIMIT 1',
      [labelId, identityId],
    );
    return row ? fromRow(row) : null;
  }

  async findByNormalizedNames(
    identityId: string,
    normalizedNames: readonly string[],
  ): Promise<LabelRecord[]> {
    const names = [...new Set(normalizedNames)];
    if (!names.length) return [];
    const placeholders = names.map(() => '?').join(', ');
    const rows = await this.db.getAll<LabelRow>(
      `SELECT * FROM labels WHERE identity_id = ? AND normalized_name IN (${placeholders})
       ORDER BY normalized_name ASC, id ASC`,
      [identityId, ...names],
    );
    return rows.map(fromRow);
  }

  async list(options: LabelListOptions): Promise<LabelRecord[]> {
    const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
    const rows = options.normalizedSearch
      ? await this.db.getAll<LabelRow>(
          `SELECT * FROM labels WHERE identity_id = ? AND normalized_name LIKE ?
           ORDER BY name ASC, id ASC LIMIT ?`,
          [options.identityId, `%${options.normalizedSearch}%`, limit],
        )
      : await this.db.getAll<LabelRow>(
          'SELECT * FROM labels WHERE identity_id = ? ORDER BY name ASC, id ASC LIMIT ?',
          [options.identityId, limit],
        );
    return rows.map(fromRow);
  }
}

function fromRow(row: LabelRow): LabelRecord {
  const createdAt = new Date(row.created_at).getTime();
  const updatedAt = new Date(row.updated_at).getTime();
  if (!Number.isFinite(createdAt) || !Number.isFinite(updatedAt)) {
    throw new TypeError('Persisted Label timestamps must be valid epoch milliseconds.');
  }
  return {
    id: row.id,
    identityId: row.identity_id,
    name: row.name,
    normalizedName: row.normalized_name,
    color: row.color == null ? null : LabelColorSchema.parse(row.color),
    createdAt,
    updatedAt,
  };
}
