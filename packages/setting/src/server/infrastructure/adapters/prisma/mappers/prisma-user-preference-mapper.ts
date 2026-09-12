import type {
  Prisma,
  UserPreferenceRecord as PrismaUserPreferenceRecord,
} from '@memoflow/database';
import type { PreferenceNamespace } from '@memoflow/contracts/setting';
import {
  parsePreferenceNamespace,
  parsePreferenceNamespacePayload,
} from '@memoflow/contracts/setting';
import { UserPreferenceDocument } from '../../../../preferences';

export class PrismaUserPreferenceMapper {
  static toDomain(row: PrismaUserPreferenceRecord): UserPreferenceDocument {
    const namespace = parsePreferenceNamespace(row.namespace);
    const payload = parsePreferenceNamespacePayload(namespace, row.payload);
    return UserPreferenceDocument.load({
      id: row.id,
      identityId: row.identityId,
      namespace,
      payload,
      revision: row.revision,
      createdAt: row.createdAt.getTime(),
      updatedAt: row.updatedAt.getTime(),
    });
  }

  static toPersistence(document: UserPreferenceDocument): {
    id: string;
    identityId: string;
    namespace: PreferenceNamespace;
    payload: Prisma.InputJsonObject;
    revision: number;
    createdAt: Date;
    updatedAt: Date;
  } {
    const state = document.snapshot();
    return {
      id: state.id,
      identityId: state.identityId,
      namespace: state.namespace,
      payload: state.payload as unknown as Prisma.InputJsonObject,
      revision: state.revision,
      createdAt: new Date(state.createdAt),
      updatedAt: new Date(state.updatedAt),
    };
  }
}
