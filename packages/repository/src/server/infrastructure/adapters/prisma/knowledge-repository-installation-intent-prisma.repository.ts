import type { PrismaClient } from '@memoflow/database';
import type {
  CreateKnowledgeRepositoryInstallationIntentInput,
  IKnowledgeRepositoryInstallationIntentRepository,
  KnowledgeRepositoryInstallationIntentRecord,
  RecordKnowledgeRepositoryInstallationCallbackOutcome,
} from '../../../application/ports/knowledge-repository-installation-intent.repository';

type KnowledgeRepositoryInstallationIntentDb = Pick<
  PrismaClient,
  'knowledgeRepositoryInstallationIntent'
>;
type IntentRow = Awaited<
  ReturnType<
    KnowledgeRepositoryInstallationIntentDb['knowledgeRepositoryInstallationIntent']['findUnique']
  >
>;

export class KnowledgeRepositoryInstallationIntentPrismaRepository implements IKnowledgeRepositoryInstallationIntentRepository {
  constructor(private readonly db: KnowledgeRepositoryInstallationIntentDb) {}

  async create(input: CreateKnowledgeRepositoryInstallationIntentInput): Promise<void> {
    await this.db.knowledgeRepositoryInstallationIntent.create({
      data: {
        id: input.id,
        identityId: input.identityId,
        stateHash: input.stateHash,
        routeKey: input.routeKey,
        clientKind: input.clientKind,
        returnPath: input.returnPath,
        status: 'Pending',
        expiresAt: new Date(input.expiresAt),
        createdAt: new Date(input.createdAt),
        updatedAt: new Date(input.createdAt),
      },
    });
  }

  async findByStateHash(
    stateHash: string,
  ): Promise<KnowledgeRepositoryInstallationIntentRecord | null> {
    return this.toRecord(
      await this.db.knowledgeRepositoryInstallationIntent.findUnique({ where: { stateHash } }),
    );
  }

  async findByIdForIdentity(
    identityId: string,
    intentId: string,
  ): Promise<KnowledgeRepositoryInstallationIntentRecord | null> {
    return this.toRecord(
      await this.db.knowledgeRepositoryInstallationIntent.findFirst({
        where: { id: intentId, identityId },
      }),
    );
  }

  async findLatestRecoverableVerified(
    identityId: string,
    routeKey: string,
    notBefore: number,
  ): Promise<KnowledgeRepositoryInstallationIntentRecord | null> {
    return this.toRecord(
      await this.db.knowledgeRepositoryInstallationIntent.findFirst({
        where: {
          identityId,
          routeKey,
          status: { in: ['CallbackReceived', 'Finalized'] },
          installationId: { not: null },
          providerAccountId: { not: null },
          callbackReceivedAt: { gte: new Date(notBefore) },
        },
        orderBy: { callbackReceivedAt: 'desc' },
      }),
    );
  }

  async findLatestRecoverableFinalized(
    identityId: string,
    routeKey: string,
    clientKind: KnowledgeRepositoryInstallationIntentRecord['clientKind'],
    notBefore: number,
  ): Promise<KnowledgeRepositoryInstallationIntentRecord | null> {
    return this.toRecord(
      await this.db.knowledgeRepositoryInstallationIntent.findFirst({
        where: {
          identityId,
          routeKey,
          clientKind,
          status: 'Finalized',
          installationId: { not: null },
          providerAccountId: { not: null },
          callbackReceivedAt: { gte: new Date(notBefore) },
        },
        orderBy: { finalizedAt: 'desc' },
      }),
    );
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
    const renewed = await this.db.knowledgeRepositoryInstallationIntent.updateMany({
      where: {
        id: input.intentId,
        identityId: input.identityId,
        status: { in: ['CallbackReceived', 'Finalized'] },
        installationId: input.installationId,
        providerAccountId: input.providerAccountId,
        callbackReceivedAt: { gte: new Date(input.notBefore) },
      },
      data: {
        expiresAt: new Date(input.expiresAt),
        updatedAt: new Date(input.now),
      },
    });
    if (renewed.count !== 1) return null;
    return this.toRecord(
      await this.db.knowledgeRepositoryInstallationIntent.findUnique({
        where: { id: input.intentId },
      }),
    );
  }

  async recordCallback(input: {
    stateHash: string;
    installationId: string;
    providerAccountId: string;
    setupAction: 'install' | 'update';
    now: number;
  }): Promise<RecordKnowledgeRepositoryInstallationCallbackOutcome> {
    const existing = await this.db.knowledgeRepositoryInstallationIntent.findUnique({
      where: { stateHash: input.stateHash },
    });
    if (!existing) return { kind: 'not_found' };
    if (existing.expiresAt.getTime() <= input.now) return { kind: 'expired' };
    if (existing.status !== 'Pending') {
      if (existing.installationId === input.installationId) {
        return { kind: 'idempotent', intent: this.toRecord(existing)! };
      }
      return { kind: 'conflict' };
    }

    const updated = await this.db.knowledgeRepositoryInstallationIntent.updateMany({
      where: {
        id: existing.id,
        stateHash: input.stateHash,
        status: 'Pending',
        expiresAt: { gt: new Date(input.now) },
      },
      data: {
        status: 'CallbackReceived',
        installationId: input.installationId,
        providerAccountId: input.providerAccountId,
        setupAction: input.setupAction,
        callbackReceivedAt: new Date(input.now),
        updatedAt: new Date(input.now),
      },
    });
    if (updated.count === 1) {
      const row = await this.db.knowledgeRepositoryInstallationIntent.findUnique({
        where: { id: existing.id },
      });
      return { kind: 'updated', intent: this.toRecord(row)! };
    }

    const raced = await this.db.knowledgeRepositoryInstallationIntent.findUnique({
      where: { id: existing.id },
    });
    if (!raced) return { kind: 'not_found' };
    if (raced.expiresAt.getTime() <= input.now) return { kind: 'expired' };
    if (raced.installationId === input.installationId && raced.status !== 'Pending') {
      return { kind: 'idempotent', intent: this.toRecord(raced)! };
    }
    return { kind: 'conflict' };
  }

  async markFinalized(input: {
    identityId: string;
    intentId: string;
    installationId: string;
    providerAccountId: string;
    now: number;
  }): Promise<KnowledgeRepositoryInstallationIntentRecord | null> {
    const existing = await this.db.knowledgeRepositoryInstallationIntent.findFirst({
      where: { id: input.intentId, identityId: input.identityId },
    });
    if (!existing || existing.expiresAt.getTime() <= input.now) return null;
    if (existing.status === 'Finalized' && existing.installationId === input.installationId) {
      return this.toRecord(existing);
    }
    if (
      existing.status !== 'CallbackReceived' ||
      existing.installationId !== input.installationId ||
      existing.providerAccountId !== input.providerAccountId
    ) {
      return null;
    }

    const updated = await this.db.knowledgeRepositoryInstallationIntent.updateMany({
      where: {
        id: input.intentId,
        identityId: input.identityId,
        status: 'CallbackReceived',
        installationId: input.installationId,
        providerAccountId: input.providerAccountId,
        expiresAt: { gt: new Date(input.now) },
      },
      data: {
        status: 'Finalized',
        finalizedAt: new Date(input.now),
        updatedAt: new Date(input.now),
      },
    });
    if (updated.count !== 1) {
      const raced = await this.db.knowledgeRepositoryInstallationIntent.findFirst({
        where: { id: input.intentId, identityId: input.identityId },
      });
      if (
        raced?.status === 'Finalized' &&
        raced.installationId === input.installationId &&
        raced.expiresAt.getTime() > input.now
      ) {
        return this.toRecord(raced);
      }
      return null;
    }
    return this.toRecord(
      await this.db.knowledgeRepositoryInstallationIntent.findUnique({
        where: { id: input.intentId },
      }),
    );
  }

  async findUsableFinalized(
    identityId: string,
    installationId: string,
    now: number,
  ): Promise<KnowledgeRepositoryInstallationIntentRecord | null> {
    return this.toRecord(
      await this.db.knowledgeRepositoryInstallationIntent.findFirst({
        where: {
          identityId,
          installationId,
          status: 'Finalized',
          expiresAt: { gt: new Date(now) },
        },
        orderBy: { finalizedAt: 'desc' },
      }),
    );
  }

  async markConsumed(input: {
    identityId: string;
    intentId: string;
    now: number;
  }): Promise<boolean> {
    const result = await this.db.knowledgeRepositoryInstallationIntent.updateMany({
      where: {
        id: input.intentId,
        identityId: input.identityId,
        status: 'Finalized',
        expiresAt: { gt: new Date(input.now) },
      },
      data: {
        status: 'Consumed',
        consumedAt: new Date(input.now),
        updatedAt: new Date(input.now),
      },
    });
    return result.count === 1;
  }

  private toRecord(row: IntentRow): KnowledgeRepositoryInstallationIntentRecord | null {
    if (!row) return null;
    return {
      id: row.id,
      identityId: row.identityId,
      stateHash: row.stateHash,
      routeKey: row.routeKey,
      clientKind: row.clientKind as KnowledgeRepositoryInstallationIntentRecord['clientKind'],
      returnPath: row.returnPath,
      status: row.status as KnowledgeRepositoryInstallationIntentRecord['status'],
      installationId: row.installationId,
      providerAccountId: row.providerAccountId,
      setupAction: row.setupAction as KnowledgeRepositoryInstallationIntentRecord['setupAction'],
      expiresAt: row.expiresAt.getTime(),
      callbackReceivedAt: row.callbackReceivedAt?.getTime() ?? null,
      finalizedAt: row.finalizedAt?.getTime() ?? null,
      consumedAt: row.consumedAt?.getTime() ?? null,
      createdAt: row.createdAt.getTime(),
      updatedAt: row.updatedAt.getTime(),
    };
  }
}
