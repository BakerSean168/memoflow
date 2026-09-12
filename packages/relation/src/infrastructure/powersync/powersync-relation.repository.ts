import type { IElectronDatabase, IElectronDatabaseTransaction } from '@memoflow/contracts/electron';
import { RelationDTOSchema, type RelationDTO, type SubjectRef } from '@memoflow/contracts/relation';
import type { AddRelationInput, RelationRepository } from '../../domain/relation-repository';

interface RelationRow {
  id: string;
  identity_id: string;
  subject_type: string;
  subject_id: string;
  relation_type: string;
  object_type: string;
  object_id: string;
  created_at: string;
  updated_at: string;
}

export class PowerSyncRelationRepository implements RelationRepository {
  constructor(
    private readonly db: IElectronDatabase,
    private readonly idFactory: () => string = () => globalThis.crypto.randomUUID(),
    private readonly now: () => number = () => Date.now(),
  ) {}

  add(input: AddRelationInput): Promise<RelationDTO> {
    return this.db.writeTransaction(async (tx) => {
      const existing = await findExact(tx, input);
      if (existing) return fromRow(existing);
      const id = this.idFactory();
      const timestamp = new Date(this.now()).toISOString();
      await tx.execute(
        `INSERT INTO relations
         (id, identity_id, subject_type, subject_id, relation_type, object_type, object_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          input.identityId,
          input.subject.type,
          input.subject.id,
          input.relationType,
          input.object.type,
          input.object.id,
          timestamp,
          timestamp,
        ],
      );
      return RelationDTOSchema.parse({
        id,
        subject: input.subject,
        relationType: input.relationType,
        object: input.object,
        createdAt: this.now(),
      });
    });
  }

  async deleteById(identityId: string, relationId: string): Promise<boolean> {
    const result = await this.db.execute('DELETE FROM relations WHERE id = ? AND identity_id = ?', [
      relationId,
      identityId,
    ]);
    return Number(result.rowsAffected ?? 0) > 0;
  }

  async deleteExact(input: AddRelationInput): Promise<boolean> {
    const result = await this.db.execute(
      `DELETE FROM relations
       WHERE identity_id = ? AND subject_type = ? AND subject_id = ?
         AND relation_type = ? AND object_type = ? AND object_id = ?`,
      relationParams(input),
    );
    return Number(result.rowsAffected ?? 0) > 0;
  }

  async deleteAllForEntity(identityId: string, entity: SubjectRef): Promise<number> {
    const result = await this.db.execute(
      `DELETE FROM relations
       WHERE identity_id = ?
         AND ((subject_type = ? AND subject_id = ?) OR (object_type = ? AND object_id = ?))`,
      [identityId, entity.type, entity.id, entity.type, entity.id],
    );
    return Number(result.rowsAffected ?? 0);
  }

  async findBySubject(identityId: string, subject: SubjectRef): Promise<RelationDTO[]> {
    const rows = await this.db.getAll<RelationRow>(
      `SELECT * FROM relations
       WHERE identity_id = ? AND subject_type = ? AND subject_id = ?
       ORDER BY created_at ASC, id ASC`,
      [identityId, subject.type, subject.id],
    );
    return rows.map(fromRow);
  }

  async findByObject(identityId: string, object: SubjectRef): Promise<RelationDTO[]> {
    const rows = await this.db.getAll<RelationRow>(
      `SELECT * FROM relations
       WHERE identity_id = ? AND object_type = ? AND object_id = ?
       ORDER BY created_at ASC, id ASC`,
      [identityId, object.type, object.id],
    );
    return rows.map(fromRow);
  }
}

function relationParams(input: AddRelationInput): unknown[] {
  return [
    input.identityId,
    input.subject.type,
    input.subject.id,
    input.relationType,
    input.object.type,
    input.object.id,
  ];
}

function findExact(
  tx: IElectronDatabaseTransaction,
  input: AddRelationInput,
): Promise<RelationRow | null> {
  return tx.getOptional<RelationRow>(
    `SELECT * FROM relations
     WHERE identity_id = ? AND subject_type = ? AND subject_id = ?
       AND relation_type = ? AND object_type = ? AND object_id = ? LIMIT 1`,
    relationParams(input),
  );
}

function fromRow(row: RelationRow): RelationDTO {
  const createdAt = new Date(row.created_at).getTime();
  if (!Number.isFinite(createdAt))
    throw new TypeError('Persisted Relation created_at must be valid.');
  return RelationDTOSchema.parse({
    id: row.id,
    subject: { type: row.subject_type, id: row.subject_id },
    relationType: row.relation_type,
    object: { type: row.object_type, id: row.object_id },
    createdAt,
  });
}
