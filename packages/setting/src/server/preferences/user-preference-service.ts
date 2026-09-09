import { randomUUID } from 'node:crypto';
import type {
  PreferenceMutationReceipt,
  PreferenceNamespace,
  PreferenceNamespacePatch,
  PreferenceNamespaceResponse,
  PreferenceRevisionConflict,
  UserPreferenceProfile,
} from '@memoflow/contracts/setting';
import {
  PreferenceMutationReceiptSchema,
  PreferenceRevisionConflictSchema,
  createDefaultPreferenceNamespace,
  createDefaultUserPreferenceProfile,
  parsePreferenceNamespace,
} from '@memoflow/contracts/setting';
import { UserPreferenceDocument } from './user-preference-document';
import type { IUserPreferenceRepository } from './user-preference-repository';

export type PreferenceMutationResult = PreferenceMutationReceipt | PreferenceRevisionConflict;

export interface ResetUserPreferencesResult {
  presentation: PreferenceMutationResult;
  regional: PreferenceMutationResult;
}

export interface UserPreferenceServiceOptions {
  now?: () => number;
  idFactory?: () => string;
}

function conflict(
  expectedRevision: number,
  latest: PreferenceNamespaceResponse,
): PreferenceRevisionConflict {
  return PreferenceRevisionConflictSchema.parse({
    code: 'preference_revision_conflict',
    namespace: latest.namespace,
    expectedRevision,
    latest,
  });
}

function receipt(
  namespace: PreferenceNamespace,
  revision: number,
  changedKeys: string[],
): PreferenceMutationReceipt {
  return PreferenceMutationReceiptSchema.parse({ namespace, revision, changedKeys });
}

export class UserPreferenceService {
  private readonly now: () => number;
  private readonly idFactory: () => string;

  constructor(
    private readonly repository: IUserPreferenceRepository,
    options: UserPreferenceServiceOptions = {},
  ) {
    this.now = options.now ?? (() => Date.now());
    this.idFactory = options.idFactory ?? (() => randomUUID());
  }

  async getPreferenceNamespace(
    identityId: string,
    namespaceInput: PreferenceNamespace,
  ): Promise<PreferenceNamespaceResponse> {
    const namespace = parsePreferenceNamespace(namespaceInput);
    const existing = await this.repository.find(identityId, namespace);
    if (existing) return existing.toResponse();
    return {
      namespace,
      preferences: createDefaultPreferenceNamespace(namespace),
      revision: 0,
    } as PreferenceNamespaceResponse;
  }

  async getPreferenceProfile(identityId: string): Promise<UserPreferenceProfile> {
    const profile = createDefaultUserPreferenceProfile();
    const documents = await this.repository.list(identityId);
    for (const document of documents) {
      if (document.namespace === 'presentation') {
        profile.presentation = document.payload as UserPreferenceProfile['presentation'];
      } else if (document.namespace === 'regional') {
        profile.regional = document.payload as UserPreferenceProfile['regional'];
      }
    }
    return profile;
  }

  async patchPreferenceNamespace<N extends PreferenceNamespace>(
    identityId: string,
    namespaceInput: N,
    patch: PreferenceNamespacePatch<N>,
    expectedRevision?: number,
  ): Promise<PreferenceMutationResult> {
    const namespace = parsePreferenceNamespace(namespaceInput) as N;
    const existing = await this.repository.find(identityId, namespace);

    if (!existing) {
      const virtualLatest = await this.getPreferenceNamespace(identityId, namespace);
      if (expectedRevision !== undefined && expectedRevision !== 0) {
        return conflict(expectedRevision, virtualLatest);
      }
      return this.createOrResolveRace(identityId, namespace, patch, expectedRevision);
    }

    if (expectedRevision !== undefined && expectedRevision !== existing.revision) {
      return conflict(expectedRevision, existing.toResponse());
    }

    const applied = existing.applyPatch(patch, this.now());
    if (applied.changedKeys.length === 0) {
      return receipt(namespace, existing.revision, []);
    }

    const result = await this.repository.compareAndSwap(applied.document, existing.revision);
    if (result.kind === 'updated') {
      return receipt(namespace, result.document.revision, applied.changedKeys);
    }
    if (result.kind === 'conflict') {
      return conflict(existing.revision, result.latest.toResponse());
    }

    return conflict(existing.revision, {
      namespace,
      preferences: createDefaultPreferenceNamespace(namespace),
      revision: 0,
    } as PreferenceNamespaceResponse);
  }

  async resetPreferenceNamespace(
    identityId: string,
    namespaceInput: PreferenceNamespace,
    expectedRevision?: number,
  ): Promise<PreferenceMutationResult> {
    const namespace = parsePreferenceNamespace(namespaceInput);
    const existing = await this.repository.find(identityId, namespace);

    if (!existing) {
      const latest = await this.getPreferenceNamespace(identityId, namespace);
      if (expectedRevision !== undefined && expectedRevision !== 0) {
        return conflict(expectedRevision, latest);
      }
      return this.materializeResetOrResolveRace(identityId, namespace, expectedRevision);
    }

    if (expectedRevision !== undefined && expectedRevision !== existing.revision) {
      return conflict(expectedRevision, existing.toResponse());
    }

    const applied = existing.reset(this.now());
    if (applied.changedKeys.length === 0) {
      return receipt(namespace, existing.revision, []);
    }

    const result = await this.repository.compareAndSwap(applied.document, existing.revision);
    if (result.kind === 'updated') {
      return receipt(namespace, result.document.revision, applied.changedKeys);
    }
    if (result.kind === 'conflict') {
      return conflict(existing.revision, result.latest.toResponse());
    }

    return conflict(existing.revision, {
      namespace,
      preferences: createDefaultPreferenceNamespace(namespace),
      revision: 0,
    } as PreferenceNamespaceResponse);
  }

  async resetUserPreferences(
    identityId: string,
    expectedRevisions: Partial<Record<PreferenceNamespace, number>> = {},
  ): Promise<ResetUserPreferencesResult> {
    const presentation = await this.resetPreferenceNamespace(
      identityId,
      'presentation',
      expectedRevisions.presentation,
    );
    const regional = await this.resetPreferenceNamespace(
      identityId,
      'regional',
      expectedRevisions.regional,
    );
    return { presentation, regional };
  }

  private async materializeResetOrResolveRace(
    identityId: string,
    namespace: PreferenceNamespace,
    expectedRevision?: number,
  ): Promise<PreferenceMutationResult> {
    const desired = UserPreferenceDocument.create({
      id: this.idFactory(),
      identityId,
      namespace,
      payload: createDefaultPreferenceNamespace(namespace),
      now: this.now(),
    });
    const created = await this.repository.create(desired);
    if (created.kind === 'created') {
      return receipt(namespace, created.document.revision, []);
    }

    if (expectedRevision === 0) {
      return conflict(0, created.document.toResponse());
    }

    const reset = created.document.reset(this.now());
    if (reset.changedKeys.length === 0) {
      return receipt(namespace, created.document.revision, []);
    }
    const retried = await this.repository.compareAndSwap(reset.document, created.document.revision);
    if (retried.kind === 'updated') {
      return receipt(namespace, retried.document.revision, reset.changedKeys);
    }
    if (retried.kind === 'conflict') {
      return conflict(created.document.revision, retried.latest.toResponse());
    }
    return conflict(created.document.revision, {
      namespace,
      preferences: createDefaultPreferenceNamespace(namespace),
      revision: 0,
    } as PreferenceNamespaceResponse);
  }

  private async createOrResolveRace<N extends PreferenceNamespace>(
    identityId: string,
    namespace: N,
    patch: PreferenceNamespacePatch<N>,
    expectedRevision?: number,
  ): Promise<PreferenceMutationResult> {
    const base = UserPreferenceDocument.create({
      id: this.idFactory(),
      identityId,
      namespace,
      payload: createDefaultPreferenceNamespace(namespace),
      now: this.now(),
    });
    const applied = base.applyPatch(patch, this.now());
    // The virtual default read model is revision 0. The first persisted row is
    // revision 1 regardless of how many fields differ from defaults; patching
    // the in-memory default document must not consume a persistence revision.
    const desired = UserPreferenceDocument.create({
      id: base.id,
      identityId,
      namespace,
      payload: applied.document.payload,
      now: this.now(),
    });
    const created = await this.repository.create(desired);

    if (created.kind === 'created') {
      return receipt(namespace, created.document.revision, applied.changedKeys);
    }

    if (expectedRevision === 0) {
      return conflict(0, created.document.toResponse());
    }

    const replay = created.document.applyPatch(patch, this.now());
    if (replay.changedKeys.length === 0) {
      return receipt(namespace, created.document.revision, []);
    }
    const retried = await this.repository.compareAndSwap(
      replay.document,
      created.document.revision,
    );
    if (retried.kind === 'updated') {
      return receipt(namespace, retried.document.revision, replay.changedKeys);
    }
    if (retried.kind === 'conflict') {
      return conflict(created.document.revision, retried.latest.toResponse());
    }
    return conflict(created.document.revision, {
      namespace,
      preferences: createDefaultPreferenceNamespace(namespace),
      revision: 0,
    } as PreferenceNamespaceResponse);
  }
}

export function createUserPreferenceService(
  repository: IUserPreferenceRepository,
  options?: UserPreferenceServiceOptions,
): UserPreferenceService {
  return new UserPreferenceService(repository, options);
}
