import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PrismaClient } from '@memoflow/database';
import type { IElectronDatabase } from '@memoflow/contracts/electron';
import {
  createAIPowerSyncRepositories,
  createAIModule,
  createAIPrismaRepositories,
  type AIPowerSyncRepositorySet,
  type AIPrismaRepositorySet,
  type IAIConversationRepository,
  type IAIProviderConfigRepository,
} from '../../../../src';

/** AI-VNEXT-07: both hosts expose only product-owned persistence. */
describe('ai repository factories surface', () => {
  const fakeElectronDb = {} as unknown as IElectronDatabase;
  const fakePrisma = {} as unknown as PrismaClient;
  const expectedKeys = [
    'conversationRepository',
    'executionRecordPort',
    'knowledgeIndexRepository',
    'providerConfigRepository',
    'providerOnboardingCommitPort',
    'providerOnboardingSessionRepository',
    'providerSecretVault',
  ];

  it('PowerSync returns the six product persistence ports', () => {
    const set = createAIPowerSyncRepositories(fakeElectronDb);
    expect(Object.keys(set).sort()).toEqual(expectedKeys);
    const typed: AIPowerSyncRepositorySet = set;
    expect(typeof typed.conversationRepository.findByIdForIdentity).toBe('function');
    expect(typeof typed.executionRecordPort.record).toBe('function');
    expect(typeof typed.providerOnboardingSessionRepository.create).toBe('function');
    expect(typeof typed.providerOnboardingCommitPort.commit).toBe('function');
  });

  it('Prisma returns the same six product persistence ports with no runtime checkpoints', () => {
    const set = createAIPrismaRepositories(fakePrisma);
    expect(Object.keys(set).sort()).toEqual(expectedKeys);
    expect(set).not.toHaveProperty('agentCheckpointPort');
    expect(set).not.toHaveProperty('langGraphCheckpointPort');
    const typed: AIPrismaRepositorySet = set;
    expect(typeof typed.conversationRepository.findByIdForIdentity).toBe('function');
    expect(typeof typed.executionRecordPort.record).toBe('function');
    expect(typeof typed.providerOnboardingSessionRepository.create).toBe('function');
    expect(typeof typed.providerOnboardingCommitPort.commit).toBe('function');
  });

  it('host capability/runtime ports stay out of both repository sets', () => {
    for (const set of [
      createAIPowerSyncRepositories(fakeElectronDb),
      createAIPrismaRepositories(fakePrisma),
    ]) {
      expect(set).not.toHaveProperty('chatExecutionPort');
      expect(set).not.toHaveProperty('goalPlanningPort');
      expect(set).not.toHaveProperty('agentRuntimePort');
      expect(set).not.toHaveProperty('checkpointPort');
    }
  });

  it('module assembly is explicit rather than a PowerSync runtime convenience factory', () => {
    const repositories = createAIPowerSyncRepositories(fakeElectronDb);
    const instance = createAIModule({
      conversationRepository: repositories.conversationRepository,
      providerConfigRepository: repositories.providerConfigRepository,
      providerSecretVault: repositories.providerSecretVault,
      providerOnboardingSessionRepository: repositories.providerOnboardingSessionRepository,
      providerOnboardingCommitPort: repositories.providerOnboardingCommitPort,
      knowledgeIndexRepository: repositories.knowledgeIndexRepository,
      executionRecordPort: repositories.executionRecordPort,
    });
    expect(typeof instance.start).toBe('function');
    expect(typeof instance.dispose).toBe('function');
  });

  it('does not leak concrete persistence adapters through root or infra barrels', async () => {
    const forbidden = [
      'PowerSyncAIConversationRepository',
      'PowerSyncAIProviderConfigRepository',
      'AIKnowledgeIndexPowerSyncRepository',
      'AIExecutionRecordPowerSyncAdapter',
      'AIConversationPrismaRepository',
      'AIExecutionRecordPrismaAdapter',
      'AIProviderConfigPrismaRepository',
      'AIKnowledgeIndexPrismaRepository',
      'AgentCheckpointPrismaAdapter',
      'LangGraphCheckpointPrismaAdapter',
    ];
    const root = readFileSync(resolve(__dirname, '../../../index.ts'), 'utf8');
    const infraBarrel = readFileSync(resolve(__dirname, '../index.ts'), 'utf8');
    for (const name of forbidden) {
      expect(root).not.toMatch(new RegExp(`\\b${name}\\b`));
      expect(infraBarrel).not.toMatch(new RegExp(`\\b${name}\\b`));
    }
    const rootModule = await import('../../../../src');
    for (const name of forbidden) expect(Object.keys(rootModule)).not.toContain(name);
  });

  it('root barrel exports only the explicit repository/module factories', async () => {
    const rootModule = await import('../../../../src');
    expect(typeof rootModule.createAIPrismaRepositories).toBe('function');
    expect(typeof rootModule.createAIPowerSyncRepositories).toBe('function');
    expect(typeof rootModule.createAIModule).toBe('function');
    expect(rootModule).not.toHaveProperty('createAIPowerSyncModule');
  });

  it('root barrel keeps product repository port types', () => {
    const conversation = (_t: IAIConversationRepository) => undefined;
    const provider = (_t: IAIProviderConfigRepository) => undefined;
    expect(typeof conversation).toBe('function');
    expect(typeof provider).toBe('function');
  });
});
