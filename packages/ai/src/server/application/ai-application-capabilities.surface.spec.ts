import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createAIModuleForTests } from '../../testing';

const ROOT = resolve(__dirname, '../../../../../');
const read = (file: string) => readFileSync(resolve(ROOT, file), 'utf8');

const CAPABILITY_METHODS = {
  providerManagement: [
    'getCapabilities',
    'getProviderCatalog',
    'probeProviderConnection',
    'testProviderOnboardingModel',
    'commitProviderOnboarding',
    'probeProviderReplacement',
    'commitProviderReplacement',
    'updateProvider',
    'deleteProvider',
    'getProvider',
    'listProviders',
    'testConnection',
    'setDefaultProvider',
    'refreshProviderModels',
  ],
  assistantConversation: [
    'createConversation',
    'updateConversation',
    'listConversations',
    'getConversation',
    'deleteConversation',
  ],
  knowledge: ['expandKnowledge', 'queryKnowledge', 'reindexKnowledge'],
  evaluationOperations: ['queryAnalytics', 'getEvaluationOverview'],
} as const;

function between(source: string, start: string, end: string): string {
  const startAt = source.indexOf(start);
  const endAt = source.indexOf(end, startAt + start.length);
  expect(startAt, `missing source marker: ${start}`).toBeGreaterThanOrEqual(0);
  expect(endAt, `missing source marker: ${end}`).toBeGreaterThan(startAt);
  return source.slice(startAt, endAt);
}

describe('AI application capability boundaries', () => {
  it('publishes the exact proven consumer-to-capability inventory and no broad facade', () => {
    const instance = createAIModuleForTests();

    for (const [capability, methods] of Object.entries(CAPABILITY_METHODS)) {
      expect(Object.keys(instance[capability as keyof typeof CAPABILITY_METHODS])).toEqual(methods);
    }
    expect(instance).not.toHaveProperty('api');
  });

  it('keeps API and Desktop composition on the same four capability properties', () => {
    const moduleSource = read('packages/ai/src/server/infrastructure/ai.module.ts');
    const apiComposition = read('apps/api/src/runtime/compose-ai.ts');
    const desktopComposition = read('apps/desktop/src/main/runtime/compose-ai.ts');

    for (const capability of Object.keys(CAPABILITY_METHODS)) {
      expect(moduleSource).toContain(`readonly ${capability}:`);
    }
    expect(apiComposition).toContain('const instance = createAIModule({');
    expect(apiComposition).toContain('return createAIApiModule({ instance });');
    expect(desktopComposition).toContain('const instance = createAIModule({');
    expect(desktopComposition).toContain('return createAIElectronModule({ instance });');
  });

  it('locks each API consumer to its own capability and excludes unrelated authority', () => {
    const api = read('packages/ai/src/api/module.ts');
    const provider = between(api, 'const providerController', 'const chatController');
    const assistant = between(api, 'const chatController', 'const knowledgeQueryController');
    const knowledge = between(
      api,
      'const knowledgeQueryController',
      'const analyticsQueryController',
    );
    const operations = between(
      api,
      'const analyticsQueryController',
      'const evaluationReportRoutes',
    );

    expect(provider).toContain('providerManagement');
    expect(provider).not.toMatch(/queryAnalytics|getEvaluationOverview|evaluationOperations/);

    expect(assistant).toContain('assistantConversation');
    expect(assistant).not.toMatch(
      /providerManagement|providerSecretVault|providerConfigRepository|evaluationOperations|queryAnalytics|getEvaluationOverview/,
    );

    expect(knowledge).toContain('options.instance.knowledge');
    expect(knowledge).not.toMatch(
      /providerManagement|providerSecretVault|providerConfigRepository|assistantConversation|evaluationOperations|createConversation|queryAnalytics|getEvaluationOverview/,
    );

    expect(operations).toContain('evaluationOperations');
    expect(operations).not.toMatch(
      /providerManagement|providerSecretVault|providerConfigRepository|assistantConversation|createConversation|updateConversation|deleteConversation|updateProvider|deleteProvider|setDefaultProvider|commitProvider/,
    );
    expect(api).not.toContain('instance.api');
  });

  it('locks Electron handlers to the matching capability owner', () => {
    const electron = read('packages/ai/src/electron/index.ts');
    const provider = between(electron, '// -- Provider Config --', '// -- Conversations --');
    const assistant = between(
      electron,
      '// -- Conversations --',
      '// AI vNext canonical Mastra Assistant transport.',
    );
    const knowledge = between(
      electron,
      '// -- Knowledge Notes --',
      '// -- Evaluation & Operations --',
    );
    const operations = between(
      electron,
      '// -- Evaluation & Operations --',
      'await aiModule.start();',
    );

    expect(provider).toContain('providerManagement.');
    expect(provider).not.toMatch(/assistantConversation\.|knowledge\.|evaluationOperations\./);
    expect(assistant).toContain('assistantConversation.');
    expect(assistant).not.toMatch(
      /providerManagement\.|providerSecretVault|providerConfigRepository|knowledge\.|evaluationOperations\./,
    );
    expect(knowledge).toContain('knowledge.');
    expect(knowledge).not.toMatch(
      /providerSecretVault|providerConfigRepository|assistantConversation\.|evaluationOperations\./,
    );
    expect(operations).toContain('evaluationOperations.');
    expect(operations).not.toMatch(
      /providerManagement\.|assistantConversation\.|knowledge\.|providerSecretVault|providerConfigRepository/,
    );
    expect(electron).not.toMatch(/aiModule\.api\.|AIApplicationPort/);
  });

  it('keeps the application capability module independent of transport and infrastructure', () => {
    const capabilities = read('packages/ai/src/server/application/ai.application.capabilities.ts');

    expect(capabilities).toMatch(/from ['"]@memoflow\/contracts\//);
    expect(capabilities).not.toMatch(/from ['"].*(?:infrastructure|transport|api|electron)/);
    expect(read('packages/ai/src/server/application/index.ts')).not.toContain(
      'ai.application.port',
    );
    expect(read('packages/ai/src/server/infrastructure/index.ts')).not.toContain(
      'AIApplicationPort',
    );
  });
});
