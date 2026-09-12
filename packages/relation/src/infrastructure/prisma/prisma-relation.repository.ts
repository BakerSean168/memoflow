import type { PrismaClient } from '@memoflow/database';
import { RelationDTOSchema, type RelationDTO, type SubjectRef } from '@memoflow/contracts/relation';
import type { AddRelationInput, RelationRepository } from '../../domain/relation-repository';

type Db = Pick<PrismaClient, 'relation'>;
type RelationRow = Awaited<ReturnType<Db['relation']['findFirst']>>;

export class PrismaRelationRepository implements RelationRepository {
  constructor(
    private readonly db: Db,
    private readonly idFactory: () => string = () => globalThis.crypto.randomUUID(),
  ) {}

  async add(input: AddRelationInput): Promise<RelationDTO> {
    const existing = await this.findExact(input);
    if (existing) return existing;
    try {
      const row = await this.db.relation.create({
        data: {
          id: this.idFactory(),
          identityId: input.identityId,
          subjectType: input.subject.type,
          subjectId: input.subject.id,
          relationType: input.relationType,
          objectType: input.object.type,
          objectId: input.object.id,
        },
      });
      return toDTO(row);
    } catch (cause) {
      const raced = await this.findExact(input);
      if (raced) return raced;
      throw cause;
    }
  }

  async deleteById(identityId: string, relationId: string): Promise<boolean> {
    const result = await this.db.relation.deleteMany({ where: { id: relationId, identityId } });
    return result.count > 0;
  }

  async deleteExact(input: AddRelationInput): Promise<boolean> {
    const result = await this.db.relation.deleteMany({ where: relationWhere(input) });
    return result.count > 0;
  }

  async deleteAllForEntity(identityId: string, entity: SubjectRef): Promise<number> {
    const result = await this.db.relation.deleteMany({
      where: {
        identityId,
        OR: [
          { subjectType: entity.type, subjectId: entity.id },
          { objectType: entity.type, objectId: entity.id },
        ],
      },
    });
    return result.count;
  }

  async findBySubject(identityId: string, subject: SubjectRef): Promise<RelationDTO[]> {
    const rows = await this.db.relation.findMany({
      where: { identityId, subjectType: subject.type, subjectId: subject.id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toDTO);
  }

  async findByObject(identityId: string, object: SubjectRef): Promise<RelationDTO[]> {
    const rows = await this.db.relation.findMany({
      where: { identityId, objectType: object.type, objectId: object.id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toDTO);
  }

  private async findExact(input: AddRelationInput): Promise<RelationDTO | null> {
    const row = await this.db.relation.findFirst({ where: relationWhere(input) });
    return row ? toDTO(row) : null;
  }
}

function relationWhere(input: AddRelationInput) {
  return {
    identityId: input.identityId,
    subjectType: input.subject.type,
    subjectId: input.subject.id,
    relationType: input.relationType,
    objectType: input.object.type,
    objectId: input.object.id,
  } as const;
}

function toDTO(row: NonNullable<RelationRow>): RelationDTO {
  return RelationDTOSchema.parse({
    id: row.id,
    subject: { type: row.subjectType, id: row.subjectId },
    relationType: row.relationType,
    object: { type: row.objectType, id: row.objectId },
    createdAt: row.createdAt.getTime(),
  });
}
