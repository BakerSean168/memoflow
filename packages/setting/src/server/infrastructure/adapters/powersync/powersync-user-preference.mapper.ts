import type { PreferenceNamespace } from '@memoflow/contracts/setting';
import {
  parsePreferenceNamespace,
  parsePreferenceNamespacePayload,
} from '@memoflow/contracts/setting';
import { UserPreferenceDocument } from '../../../preferences';

export interface PowerSyncUserPreferenceRow {
  id: string;
  identity_id: string;
  namespace: string;
  payload: string;
  revision: number;
  created_at: string;
  updated_at: string;
}

export class PowerSyncUserPreferenceMapper {
  static toDomain(row: PowerSyncUserPreferenceRow): UserPreferenceDocument {
    const namespace = parsePreferenceNamespace(row.namespace);
    const payload = parsePreferenceNamespacePayload(namespace, JSON.parse(row.payload) as unknown);
    return UserPreferenceDocument.load({
      id: row.id,
      identityId: row.identity_id,
      namespace,
      payload,
      revision: Number(row.revision),
      createdAt: Date.parse(row.created_at),
      updatedAt: Date.parse(row.updated_at),
    });
  }

  static toPersistence(document: UserPreferenceDocument): {
    id: string;
    identityId: string;
    namespace: PreferenceNamespace;
    payload: string;
    revision: number;
    createdAt: string;
    updatedAt: string;
  } {
    const state = document.snapshot();
    return {
      id: state.id,
      identityId: state.identityId,
      namespace: state.namespace,
      payload: JSON.stringify(state.payload),
      revision: state.revision,
      createdAt: new Date(state.createdAt).toISOString(),
      updatedAt: new Date(state.updatedAt).toISOString(),
    };
  }
}
