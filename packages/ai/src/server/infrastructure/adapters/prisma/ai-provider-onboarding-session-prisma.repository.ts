import type { PrismaClient } from '@memoflow/database';
import type { AIModelInfo, AIProviderCatalogId } from '@memoflow/contracts/ai';
import type { AIProviderCredentialRef } from '@memoflow/contracts/primitives';
import type {
  AIProviderOnboardingSessionRecord,
  CreateAIProviderOnboardingSessionInput,
  IAIProviderOnboardingSessionRepository,
} from '../../../application/ports/provider-onboarding-session.repository';

type OnboardingDb = Pick<PrismaClient, 'aiProviderOnboardingSession'>;
type SessionRow = Awaited<ReturnType<OnboardingDb['aiProviderOnboardingSession']['findUnique']>>;

export class AIProviderOnboardingSessionPrismaRepository implements IAIProviderOnboardingSessionRepository {
  constructor(private readonly db: OnboardingDb) {}

  async create(input: CreateAIProviderOnboardingSessionInput): Promise<void> {
    await this.db.aiProviderOnboardingSession.create({
      data: {
        id: input.id,
        identityId: input.identityId,
        catalogId: input.catalogId,
        baseUrl: input.baseUrl,
        targetProviderId: input.targetProviderId ?? null,
        credentialRef: input.credentialRef,
        credentialStatus: input.credentialStatus,
        discoveryStatus: input.discoveryStatus,
        modelsJson: JSON.stringify(input.models),
        verifiedModelIds: '[]',
        expiresAt: new Date(input.expiresAt),
        createdAt: new Date(input.now),
        updatedAt: new Date(input.now),
      },
    });
  }

  async findUsable(identityId: string, onboardingId: string, now: number) {
    return this.toRecord(
      await this.db.aiProviderOnboardingSession.findFirst({
        where: {
          id: onboardingId,
          identityId,
          consumedAt: null,
          expiresAt: { gt: new Date(now) },
        },
      }),
    );
  }

  async markModelVerified(input: { identityId: string; onboardingId: string; modelId: string; now: number }) {
    const current = await this.db.aiProviderOnboardingSession.findFirst({
      where: {
        id: input.onboardingId,
        identityId: input.identityId,
        consumedAt: null,
        expiresAt: { gt: new Date(input.now) },
      },
    });
    if (!current) return null;
    const verified = Array.from(new Set([...parseStringArray(current.verifiedModelIds), input.modelId]));
    const updated = await this.db.aiProviderOnboardingSession.updateMany({
      where: {
        id: input.onboardingId,
        identityId: input.identityId,
        consumedAt: null,
        expiresAt: { gt: new Date(input.now) },
      },
      data: {
        credentialStatus: 'valid',
        verifiedModelIds: JSON.stringify(verified),
        updatedAt: new Date(input.now),
      },
    });
    if (updated.count !== 1) return null;
    return this.toRecord(
      await this.db.aiProviderOnboardingSession.findUnique({ where: { id: input.onboardingId } }),
    );
  }

  async markConsumed(input: { identityId: string; onboardingId: string; now: number }): Promise<boolean> {
    const updated = await this.db.aiProviderOnboardingSession.updateMany({
      where: {
        id: input.onboardingId,
        identityId: input.identityId,
        consumedAt: null,
        expiresAt: { gt: new Date(input.now) },
      },
      data: { consumedAt: new Date(input.now), updatedAt: new Date(input.now) },
    });
    return updated.count === 1;
  }

  private toRecord(row: SessionRow): AIProviderOnboardingSessionRecord | null {
    if (!row) return null;
    return {
      id: row.id,
      identityId: row.identityId,
      catalogId: row.catalogId as AIProviderCatalogId,
      baseUrl: row.baseUrl,
      targetProviderId: row.targetProviderId,
      credentialRef: row.credentialRef as AIProviderCredentialRef,
      credentialStatus: row.credentialStatus as AIProviderOnboardingSessionRecord['credentialStatus'],
      discoveryStatus: row.discoveryStatus as AIProviderOnboardingSessionRecord['discoveryStatus'],
      models: parseModels(row.modelsJson),
      verifiedModelIds: parseStringArray(row.verifiedModelIds),
      expiresAt: row.expiresAt.getTime(),
      consumedAt: row.consumedAt?.getTime() ?? null,
      createdAt: row.createdAt.getTime(),
      updatedAt: row.updatedAt.getTime(),
    };
  }
}

function parseModels(value: string): AIModelInfo[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as AIModelInfo[]) : [];
  } catch {
    return [];
  }
}

function parseStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}
