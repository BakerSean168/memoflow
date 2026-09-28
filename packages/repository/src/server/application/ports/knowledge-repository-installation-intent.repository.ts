import type {
  KnowledgeRepositoryInstallationClientKind,
  KnowledgeRepositoryInstallationIntentStatus,
} from '@memoflow/contracts/repository';

export interface KnowledgeRepositoryInstallationIntentRecord {
  id: string;
  identityId: string;
  stateHash: string;
  routeKey: string;
  clientKind: KnowledgeRepositoryInstallationClientKind;
  returnPath: string;
  status: Exclude<KnowledgeRepositoryInstallationIntentStatus, 'Expired'>;
  installationId: string | null;
  providerAccountId: string | null;
  setupAction: 'install' | 'update' | null;
  expiresAt: number;
  callbackReceivedAt: number | null;
  finalizedAt: number | null;
  consumedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface CreateKnowledgeRepositoryInstallationIntentInput {
  id: string;
  identityId: string;
  stateHash: string;
  routeKey: string;
  clientKind: KnowledgeRepositoryInstallationClientKind;
  returnPath: string;
  expiresAt: number;
  createdAt: number;
}

export type RecordKnowledgeRepositoryInstallationCallbackOutcome =
  | { kind: 'updated'; intent: KnowledgeRepositoryInstallationIntentRecord }
  | { kind: 'idempotent'; intent: KnowledgeRepositoryInstallationIntentRecord }
  | { kind: 'not_found' }
  | { kind: 'expired' }
  | { kind: 'conflict' };

export interface IKnowledgeRepositoryInstallationIntentRepository {
  create(input: CreateKnowledgeRepositoryInstallationIntentInput): Promise<void>;
  findByStateHash(stateHash: string): Promise<KnowledgeRepositoryInstallationIntentRecord | null>;
  findByIdForIdentity(
    identityId: string,
    intentId: string,
  ): Promise<KnowledgeRepositoryInstallationIntentRecord | null>;
  findLatestRecoverableVerified(
    identityId: string,
    routeKey: string,
    notBefore: number,
  ): Promise<KnowledgeRepositoryInstallationIntentRecord | null>;
  findLatestRecoverableFinalized(
    identityId: string,
    routeKey: string,
    clientKind: KnowledgeRepositoryInstallationClientKind,
    notBefore: number,
  ): Promise<KnowledgeRepositoryInstallationIntentRecord | null>;
  renewVerifiedForRetry(input: {
    identityId: string;
    intentId: string;
    installationId: string;
    providerAccountId: string;
    notBefore: number;
    expiresAt: number;
    now: number;
  }): Promise<KnowledgeRepositoryInstallationIntentRecord | null>;
  recordCallback(input: {
    stateHash: string;
    installationId: string;
    providerAccountId: string;
    setupAction: 'install' | 'update';
    now: number;
  }): Promise<RecordKnowledgeRepositoryInstallationCallbackOutcome>;
  markFinalized(input: {
    identityId: string;
    intentId: string;
    installationId: string;
    providerAccountId: string;
    now: number;
  }): Promise<KnowledgeRepositoryInstallationIntentRecord | null>;
  findUsableFinalized(
    identityId: string,
    installationId: string,
    now: number,
  ): Promise<KnowledgeRepositoryInstallationIntentRecord | null>;
  markConsumed(input: { identityId: string; intentId: string; now: number }): Promise<boolean>;
}
