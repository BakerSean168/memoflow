import type { ModuleManifest } from '@memoflow/contracts/shared';
import { RelationTypes, SubjectTypes, type CreateRelationReq } from '@memoflow/contracts/relation';
import type { RelationService } from './relation-service';

/** Shared Relation owns the generic internal manifest command and relation vocabulary. */
export function createRelationModuleManifest(
  service: Pick<RelationService, 'add'>,
): ModuleManifest {
  return {
    module: 'relation',
    commands: [
      {
        name: 'relation.create',
        module: 'relation',
        execute: (identityId, payload) => service.add(identityId, payload as CreateRelationReq),
      },
    ],
    relations: {
      subjectTypes: SubjectTypes,
      relationTypes: RelationTypes,
      module: 'relation',
    },
  };
}
