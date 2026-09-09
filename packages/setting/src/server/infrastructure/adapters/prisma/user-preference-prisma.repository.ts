import type { PrismaClient } from '@memoflow/database';
import type { PreferenceNamespace } from '@memoflow/contracts/setting';
import type {
  IUserPreferenceRepository,
  PreferenceCompareAndSwapResult,
  PreferenceCreateResult,
} from '../../../preferences';
import { UserPreferenceDocument } from '../../../preferences';
import { PrismaUserPreferenceMapper } from './mappers/prisma-user-preference-mapper';

interface UserPreferencePrismaDb {
  userPreferenceRecord: PrismaClient['userPreferenceRecord'];
}

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2002');
}

function assertCreateRevision(document: UserPreferenceDocument): void {
  if (document.revision !== 1) {
    throw new TypeError(
      `New preference rows must start at revision 1, got ${String(document.revision)}`,
    );
  }
}

function assertCasRevision(document: UserPreferenceDocument, expectedRevision: number): void {
  if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
    throw new TypeError(`Invalid expected preference revision: ${String(expectedRevision)}`);
  }
  if (document.revision !== expectedRevision + 1) {
    throw new TypeError(
      `Preference CAS must advance exactly one revision: expected ${String(expectedRevision + 1)}, got ${String(document.revision)}`,
    );
  }
}

export class UserPreferencePrismaRepository implements IUserPreferenceRepository {
  private readonly db: UserPreferencePrismaDb;

  constructor(db: UserPreferencePrismaDb | PrismaClient) {
    this.db = db;
  }

  async find(
    identityId: string,
    namespace: PreferenceNamespace,
  ): Promise<UserPreferenceDocument | null> {
    const row = await this.db.userPreferenceRecord.findUnique({
      where: { identityId_namespace: { identityId, namespace } },
    });
    return row ? PrismaUserPreferenceMapper.toDomain(row) : null;
  }

  async list(identityId: string): Promise<readonly UserPreferenceDocument[]> {
    const rows = await this.db.userPreferenceRecord.findMany({
      where: { identityId },
      orderBy: { namespace: 'asc' },
    });
    return rows.map((row) => PrismaUserPreferenceMapper.toDomain(row));
  }

  async create(document: UserPreferenceDocument): Promise<PreferenceCreateResult> {
    assertCreateRevision(document);
    const data = PrismaUserPreferenceMapper.toPersistence(document);
    try {
      const created = await this.db.userPreferenceRecord.create({ data });
      return { kind: 'created', document: PrismaUserPreferenceMapper.toDomain(created) };
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      const winner = await this.find(document.identityId, document.namespace);
      if (!winner) throw error;
      return { kind: 'exists', document: winner };
    }
  }

  async compareAndSwap(
    document: UserPreferenceDocument,
    expectedRevision: number,
  ): Promise<PreferenceCompareAndSwapResult> {
    assertCasRevision(document, expectedRevision);
    const data = PrismaUserPreferenceMapper.toPersistence(document);
    const updated = await this.db.userPreferenceRecord.updateMany({
      where: {
        identityId: data.identityId,
        namespace: data.namespace,
        revision: expectedRevision,
      },
      data: {
        payload: data.payload,
        revision: data.revision,
        updatedAt: data.updatedAt,
      },
    });

    if (updated.count === 1) {
      return { kind: 'updated', document };
    }
    if (updated.count > 1) {
      throw new Error(
        `Preference CAS updated ${String(updated.count)} rows for a unique namespace key`,
      );
    }

    const latest = await this.find(data.identityId, data.namespace);
    return latest ? { kind: 'conflict', latest } : { kind: 'missing' };
  }
}
