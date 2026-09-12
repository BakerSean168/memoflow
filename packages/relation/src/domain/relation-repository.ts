import type { RelationDTO, RelationType, SubjectRef } from '@memoflow/contracts/relation';

export interface AddRelationInput {
  readonly identityId: string;
  readonly subject: SubjectRef;
  readonly relationType: RelationType;
  readonly object: SubjectRef;
}

export interface RelationRepository {
  /** Idempotent add: the same six-part relation key returns the existing row. */
  add(input: AddRelationInput): Promise<RelationDTO>;
  deleteById(identityId: string, relationId: string): Promise<boolean>;
  deleteExact(input: AddRelationInput): Promise<boolean>;
  deleteAllForEntity(identityId: string, entity: SubjectRef): Promise<number>;
  findBySubject(identityId: string, subject: SubjectRef): Promise<RelationDTO[]>;
  findByObject(identityId: string, object: SubjectRef): Promise<RelationDTO[]>;
}
