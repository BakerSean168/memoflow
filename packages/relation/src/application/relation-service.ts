import {
  CreateRelationReqSchema,
  DeleteRelationReqSchema,
  SubjectRefSchema,
  type CreateRelationReq,
  type RelationDTO,
  type SubjectRef,
} from '@memoflow/contracts/relation';
import type { RelationRepository } from '../domain/relation-repository';

export class RelationService {
  constructor(private readonly repository: RelationRepository) {}

  add(identityId: string, request: CreateRelationReq): Promise<RelationDTO> {
    const input = CreateRelationReqSchema.parse(request);
    return this.repository.add({ identityId, ...input });
  }

  async remove(identityId: string, relationId: string): Promise<boolean> {
    const request = DeleteRelationReqSchema.parse({ relationId });
    return this.repository.deleteById(identityId, request.relationId);
  }

  async removeExact(identityId: string, request: CreateRelationReq): Promise<boolean> {
    const input = CreateRelationReqSchema.parse(request);
    return this.repository.deleteExact({ identityId, ...input });
  }

  async removeAllForEntity(identityId: string, entity: SubjectRef): Promise<number> {
    return this.repository.deleteAllForEntity(identityId, SubjectRefSchema.parse(entity));
  }

  async forward(identityId: string, subject: SubjectRef): Promise<RelationDTO[]> {
    return this.repository.findBySubject(identityId, SubjectRefSchema.parse(subject));
  }

  async reverse(identityId: string, object: SubjectRef): Promise<RelationDTO[]> {
    return this.repository.findByObject(identityId, SubjectRefSchema.parse(object));
  }
}
