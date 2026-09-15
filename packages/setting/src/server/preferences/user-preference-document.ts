import type {
  PreferenceNamespace,
  PreferenceNamespacePatch,
  PreferenceNamespacePayload,
  PreferenceNamespaceResponse,
} from '@memoflow/contracts/setting';
import {
  PreferenceNamespaceResponseSchema,
  createDefaultPreferenceNamespace,
  parsePreferenceNamespace,
  parsePreferenceNamespacePatch,
  parsePreferenceNamespacePayload,
} from '@memoflow/contracts/setting';

export interface UserPreferenceDocumentState<N extends PreferenceNamespace = PreferenceNamespace> {
  id: string;
  identityId: string;
  namespace: N;
  payload: PreferenceNamespacePayload<N>;
  revision: number;
  createdAt: number;
  updatedAt: number;
}

export interface UserPreferencePatchResult<N extends PreferenceNamespace = PreferenceNamespace> {
  document: UserPreferenceDocument<N>;
  changedKeys: string[];
}

function assertRevision(value: number): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new TypeError(`Invalid preference revision: ${String(value)}`);
  }
}

function assertTimestamp(name: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new TypeError(`Invalid ${name}: ${String(value)}`);
  }
}

function clonePayload<N extends PreferenceNamespace>(
  payload: PreferenceNamespacePayload<N>,
): PreferenceNamespacePayload<N> {
  return structuredClone(payload);
}

export class UserPreferenceDocument<N extends PreferenceNamespace = PreferenceNamespace> {
  private constructor(private readonly state: UserPreferenceDocumentState<N>) {}

  static load<N extends PreferenceNamespace>(
    state: UserPreferenceDocumentState<N>,
  ): UserPreferenceDocument<N> {
    const namespace = parsePreferenceNamespace(state.namespace) as N;
    const payload = parsePreferenceNamespacePayload(namespace, state.payload);
    assertRevision(state.revision);
    assertTimestamp('createdAt', state.createdAt);
    assertTimestamp('updatedAt', state.updatedAt);

    return new UserPreferenceDocument({
      ...state,
      namespace,
      payload: clonePayload(payload),
    });
  }

  static create<N extends PreferenceNamespace>(input: {
    id: string;
    identityId: string;
    namespace: N;
    payload?: PreferenceNamespacePayload<N>;
    now?: number;
  }): UserPreferenceDocument<N> {
    const namespace = parsePreferenceNamespace(input.namespace) as N;
    const payload = parsePreferenceNamespacePayload(
      namespace,
      input.payload ?? createDefaultPreferenceNamespace(namespace),
    );
    const now = input.now ?? Date.now();
    assertTimestamp('now', now);

    return new UserPreferenceDocument({
      id: input.id,
      identityId: input.identityId,
      namespace,
      payload: clonePayload(payload),
      revision: 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  get id(): string {
    return this.state.id;
  }

  get identityId(): string {
    return this.state.identityId;
  }

  get namespace(): N {
    return this.state.namespace;
  }

  get revision(): number {
    return this.state.revision;
  }

  get createdAt(): number {
    return this.state.createdAt;
  }

  get updatedAt(): number {
    return this.state.updatedAt;
  }

  get payload(): PreferenceNamespacePayload<N> {
    return clonePayload(this.state.payload);
  }

  snapshot(): UserPreferenceDocumentState<N> {
    return {
      ...this.state,
      payload: clonePayload(this.state.payload),
    };
  }

  toResponse(): PreferenceNamespaceResponse {
    return PreferenceNamespaceResponseSchema.parse({
      namespace: this.state.namespace,
      preferences: clonePayload(this.state.payload),
      revision: this.state.revision,
    });
  }

  applyPatch(
    patch: PreferenceNamespacePatch<N>,
    now: number = Date.now(),
  ): UserPreferencePatchResult<N> {
    const validatedPatch = parsePreferenceNamespacePatch(this.state.namespace, patch) as Record<
      string,
      unknown
    >;
    const current = this.state.payload as Record<string, unknown>;
    const changedKeys = Object.keys(validatedPatch).filter(
      (key) => !Object.is(current[key], validatedPatch[key]),
    );

    if (changedKeys.length === 0) {
      return { document: this, changedKeys: [] };
    }

    const merged = parsePreferenceNamespacePayload(this.state.namespace, {
      ...current,
      ...validatedPatch,
    });
    assertTimestamp('updatedAt', now);

    return {
      document: UserPreferenceDocument.load({
        ...this.state,
        payload: merged,
        revision: this.state.revision + 1,
        updatedAt: now,
      }),
      changedKeys,
    };
  }

  reset(now: number = Date.now()): UserPreferencePatchResult<N> {
    const defaults = createDefaultPreferenceNamespace(this.state.namespace);
    return this.applyPatch(defaults as PreferenceNamespacePatch<N>, now);
  }
}
