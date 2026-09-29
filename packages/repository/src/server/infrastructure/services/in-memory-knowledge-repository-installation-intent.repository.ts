import type {
  CreateKnowledgeRepositoryInstallationIntentInput,
  IKnowledgeRepositoryInstallationIntentRepository,
  KnowledgeRepositoryInstallationIntentRecord,
  RecordKnowledgeRepositoryInstallationCallbackOutcome,
} from '../../application/ports/knowledge-repository-installation-intent.repository';

export class InMemoryKnowledgeRepositoryInstallationIntentRepository implements IKnowledgeRepositoryInstallationIntentRepository {
  private readonly rows = new Map<string, KnowledgeRepositoryInstallationIntentRecord>();
  private readonly byStateHash = new Map<string, string>();

  async create(input: CreateKnowledgeRepositoryInstallationIntentInput): Promise<void> {
    if (this.rows.has(input.id) || this.byStateHash.has(input.stateHash)) {
      throw new Error('Knowledge repository installation intent already exists');
    }
    const row: KnowledgeRepositoryInstallationIntentRecord = {
      ...input,
      status: 'Pending',
      installationId: null,
      providerAccountId: null,
      setupAction: null,
      callbackReceivedAt: null,
      finalizedAt: null,
      consumedAt: null,
      updatedAt: input.createdAt,
    };
    this.rows.set(input.id, row);
    this.byStateHash.set(input.stateHash, input.id);
  }

  async findByStateHash(
    stateHash: string,
  ): Promise<KnowledgeRepositoryInstallationIntentRecord | null> {
    const id = this.byStateHash.get(stateHash);
    return id ? this.clone(this.rows.get(id) ?? null) : null;
  }

  async findByIdForIdentity(
    identityId: string,
    intentId: string,
  ): Promise<KnowledgeRepositoryInstallationIntentRecord | null> {
    const row = this.rows.get(intentId);
    return row?.identityId === identityId ? this.clone(row) : null;
  }

  async findLatestRecoverableVerified(
    identityId: string,
    routeKey: string,
    notBefore: number,
  ): Promise<KnowledgeRepositoryInstallationIntentRecord | null> {
    const candidates = [...this.rows.values()]
      .filter(
        (row) =>
          row.identityId === identityId &&
          row.routeKey === routeKey &&
          (row.status === 'CallbackReceived' || row.status === 'Finalized') &&
          row.installationId !== null &&
          row.providerAccountId !== null &&
          row.callbackReceivedAt !== null &&
          row.callbackReceivedAt >= notBefore,
      )
      .sort((a, b) => (b.callbackReceivedAt ?? 0) - (a.callbackReceivedAt ?? 0));
    return this.clone(candidates[0] ?? null);
  }

  async findLatestRecoverableFinalized(
    identityId: string,
    routeKey: string,
    clientKind: KnowledgeRepositoryInstallationIntentRecord['clientKind'],
    notBefore: number,
  ): Promise<KnowledgeRepositoryInstallationIntentRecord | null> {
    const candidates = [...this.rows.values()]
      .filter(
        (row) =>
          row.identityId === identityId &&
          row.routeKey === routeKey &&
          row.clientKind === clientKind &&
          row.status === 'Finalized' &&
          row.installationId !== null &&
          row.providerAccountId !== null &&
          row.callbackReceivedAt !== null &&
          row.callbackReceivedAt >= notBefore,
      )
      .sort((a, b) => (b.finalizedAt ?? 0) - (a.finalizedAt ?? 0));
    return this.clone(candidates[0] ?? null);
  }

  async renewVerifiedForRetry(input: {
    identityId: string;
    intentId: string;
    installationId: string;
    providerAccountId: string;
    notBefore: number;
    expiresAt: number;
    now: number;
  }): Promise<KnowledgeRepositoryInstallationIntentRecord | null> {
    const row = this.rows.get(input.intentId);
    if (
      !row ||
      row.identityId !== input.identityId ||
      (row.status !== 'CallbackReceived' && row.status !== 'Finalized') ||
      row.installationId !== input.installationId ||
      row.providerAccountId !== input.providerAccountId ||
      row.callbackReceivedAt === null ||
      row.callbackReceivedAt < input.notBefore
    ) {
      return null;
    }
    const updated: KnowledgeRepositoryInstallationIntentRecord = {
      ...row,
      expiresAt: input.expiresAt,
      updatedAt: input.now,
    };
    this.rows.set(row.id, updated);
    return this.clone(updated);
  }

  async recordCallback(input: {
    stateHash: string;
    installationId: string;
    providerAccountId: string;
    setupAction: 'install' | 'update';
    now: number;
  }): Promise<RecordKnowledgeRepositoryInstallationCallbackOutcome> {
    const id = this.byStateHash.get(input.stateHash);
    const row = id ? this.rows.get(id) : undefined;
    if (!row) return { kind: 'not_found' };
    if (row.expiresAt <= input.now) return { kind: 'expired' };
    if (row.status !== 'Pending') {
      if (row.installationId === input.installationId) {
        return { kind: 'idempotent', intent: this.clone(row)! };
      }
      return { kind: 'conflict' };
    }
    const updated: KnowledgeRepositoryInstallationIntentRecord = {
      ...row,
      status: 'CallbackReceived',
      installationId: input.installationId,
      providerAccountId: input.providerAccountId,
      setupAction: input.setupAction,
      callbackReceivedAt: input.now,
      updatedAt: input.now,
    };
    this.rows.set(updated.id, updated);
    return { kind: 'updated', intent: this.clone(updated)! };
  }

  async markFinalized(input: {
    identityId: string;
    intentId: string;
    installationId: string;
    providerAccountId: string;
    now: number;
  }): Promise<KnowledgeRepositoryInstallationIntentRecord | null> {
    const row = this.rows.get(input.intentId);
    if (!row || row.identityId !== input.identityId || row.expiresAt <= input.now) return null;
    if (row.status === 'Finalized' && row.installationId === input.installationId) {
      return this.clone(row);
    }
    if (
      row.status !== 'CallbackReceived' ||
      row.installationId !== input.installationId ||
      row.providerAccountId !== input.providerAccountId
    ) {
      return null;
    }
    const updated: KnowledgeRepositoryInstallationIntentRecord = {
      ...row,
      status: 'Finalized',
      finalizedAt: input.now,
      updatedAt: input.now,
    };
    this.rows.set(updated.id, updated);
    return this.clone(updated);
  }

  async findUsableFinalized(
    identityId: string,
    installationId: string,
    now: number,
  ): Promise<KnowledgeRepositoryInstallationIntentRecord | null> {
    for (const row of this.rows.values()) {
      if (
        row.identityId === identityId &&
        row.installationId === installationId &&
        row.status === 'Finalized' &&
        row.expiresAt > now
      ) {
        return this.clone(row);
      }
    }
    return null;
  }

  async markConsumed(input: {
    identityId: string;
    intentId: string;
    now: number;
  }): Promise<boolean> {
    const row = this.rows.get(input.intentId);
    if (
      !row ||
      row.identityId !== input.identityId ||
      row.status !== 'Finalized' ||
      row.expiresAt <= input.now
    ) {
      return false;
    }
    this.rows.set(row.id, {
      ...row,
      status: 'Consumed',
      consumedAt: input.now,
      updatedAt: input.now,
    });
    return true;
  }

  private clone(
    row: KnowledgeRepositoryInstallationIntentRecord | null,
  ): KnowledgeRepositoryInstallationIntentRecord | null {
    return row ? { ...row } : null;
  }
}
