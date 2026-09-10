import { LabelColorSchema } from '@memoflow/contracts/label';
import type { PrismaClient } from '@memoflow/database';
import type { LabelRecord, NewLabelRecord } from '../../domain/label';
import type { LabelListOptions, LabelRepository } from '../../domain/label-repository';

type Db = Pick<PrismaClient, 'label'>;
type LabelRow = Awaited<ReturnType<Db['label']['findFirst']>>;
type LabelUpdateInput = Parameters<LabelRepository['update']>[0];

export class PrismaLabelRepository implements LabelRepository {
  constructor(private readonly db: Db) {}

  async create(record: NewLabelRecord): Promise<LabelRecord> {
    const row = await this.db.label.create({
      data: {
        id: record.id,
        identityId: record.identityId,
        name: record.name,
        normalizedName: record.normalizedName,
        color: record.color,
        createdAt: new Date(record.createdAt),
        updatedAt: new Date(record.updatedAt),
      },
    });
    return toRecord(row);
  }

  async update(input: LabelUpdateInput): Promise<LabelRecord | null> {
    const existing = await this.db.label.findFirst({
      where: { id: input.labelId, identityId: input.identityId },
      select: { id: true },
    });
    if (!existing) return null;
    const row = await this.db.label.update({
      where: { id: input.labelId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.normalizedName !== undefined ? { normalizedName: input.normalizedName } : {}),
        ...(input.color !== undefined ? { color: input.color } : {}),
        updatedAt: new Date(input.updatedAt),
      },
    });
    return toRecord(row);
  }

  async delete(identityId: string, labelId: string): Promise<boolean> {
    const result = await this.db.label.deleteMany({ where: { id: labelId, identityId } });
    return result.count > 0;
  }

  async findById(identityId: string, labelId: string): Promise<LabelRecord | null> {
    const row = await this.db.label.findFirst({ where: { id: labelId, identityId } });
    return row ? toRecord(row) : null;
  }

  async findByNormalizedNames(
    identityId: string,
    normalizedNames: readonly string[],
  ): Promise<LabelRecord[]> {
    const names = [...new Set(normalizedNames)];
    if (!names.length) return [];
    const rows = await this.db.label.findMany({
      where: { identityId, normalizedName: { in: names } },
      orderBy: [{ normalizedName: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toRecord);
  }

  async list(options: LabelListOptions): Promise<LabelRecord[]> {
    const rows = await this.db.label.findMany({
      where: {
        identityId: options.identityId,
        ...(options.normalizedSearch
          ? { normalizedName: { contains: options.normalizedSearch } }
          : {}),
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: Math.min(Math.max(options.limit ?? 100, 1), 500),
    });
    return rows.map(toRecord);
  }
}

function toRecord(row: NonNullable<LabelRow>): LabelRecord {
  return {
    id: row.id,
    identityId: row.identityId,
    name: row.name,
    normalizedName: row.normalizedName,
    color: row.color == null ? null : LabelColorSchema.parse(row.color),
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  };
}
