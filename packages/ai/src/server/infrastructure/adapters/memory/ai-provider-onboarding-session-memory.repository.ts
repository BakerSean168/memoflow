import type {
  AIProviderOnboardingSessionRecord,
  CreateAIProviderOnboardingSessionInput,
  IAIProviderOnboardingSessionRepository,
} from '../../../application/ports/provider-onboarding-session.repository';

/** Process-local Desktop/test implementation. API uses the durable Prisma adapter. */
export class AIProviderOnboardingSessionMemoryRepository implements IAIProviderOnboardingSessionRepository {
  private readonly rows = new Map<string, AIProviderOnboardingSessionRecord>();

  async create(input: CreateAIProviderOnboardingSessionInput): Promise<void> {
    if (this.rows.has(input.id)) throw new Error('AI provider onboarding session already exists');
    this.rows.set(input.id, {
      id: input.id,
      identityId: input.identityId,
      catalogId: input.catalogId,
      baseUrl: input.baseUrl,
      targetProviderId: input.targetProviderId ?? null,
      credentialRef: input.credentialRef,
      credentialStatus: input.credentialStatus,
      discoveryStatus: input.discoveryStatus,
      models: [...input.models],
      verifiedModelIds: [],
      expiresAt: input.expiresAt,
      consumedAt: null,
      createdAt: input.now,
      updatedAt: input.now,
    });
  }

  async findUsable(identityId: string, onboardingId: string, now: number) {
    const row = this.rows.get(onboardingId);
    if (!row || row.identityId !== identityId || row.expiresAt <= now || row.consumedAt != null) {
      return null;
    }
    return clone(row);
  }

  async markModelVerified(input: { identityId: string; onboardingId: string; modelId: string; now: number }) {
    const row = this.rows.get(input.onboardingId);
    if (!row || row.identityId !== input.identityId || row.expiresAt <= input.now || row.consumedAt != null) {
      return null;
    }
    const next: AIProviderOnboardingSessionRecord = {
      ...row,
      credentialStatus: 'valid',
      verifiedModelIds: Array.from(new Set([...row.verifiedModelIds, input.modelId])),
      updatedAt: input.now,
    };
    this.rows.set(row.id, next);
    return clone(next);
  }

  async markConsumed(input: { identityId: string; onboardingId: string; now: number }): Promise<boolean> {
    const row = this.rows.get(input.onboardingId);
    if (!row || row.identityId !== input.identityId || row.expiresAt <= input.now || row.consumedAt != null) {
      return false;
    }
    this.rows.set(row.id, { ...row, consumedAt: input.now, updatedAt: input.now });
    return true;
  }
}

function clone(row: AIProviderOnboardingSessionRecord): AIProviderOnboardingSessionRecord {
  return { ...row, models: [...row.models], verifiedModelIds: [...row.verifiedModelIds] };
}
