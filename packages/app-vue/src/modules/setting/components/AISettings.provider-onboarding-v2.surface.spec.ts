import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Agent Settings direct connection surface (secure onboarding reused without vendor wizard)', () => {
  const source = readFileSync(resolve(__dirname, 'AISettings.vue'), 'utf8');
  const connection = readFileSync(resolve(__dirname, 'MastraAgentSettings.vue'), 'utf8');
  const wizard = readFileSync(resolve(__dirname, 'AgentInstanceWizard.vue'), 'utf8');
  it('removes the legacy catalogue bootstrap and second vendor selection dialog', () => {
    for (const forbidden of [
      'AI_PROVIDER_TEMPLATES',
      'submitQuickProvider',
      'providerCatalog',
      'openOnboarding',
      'onboardingOpen',
      'OnboardingStep',
    ]) {
      expect(source).not.toContain(forbidden);
      expect(wizard).not.toContain(forbidden);
    }
    expect(source).toContain('MastraAgentSettings');
    expect(connection).not.toContain('<Dialog');
    expect(connection).not.toContain('getProviderCatalog');
  });
  it('keeps opaque-handle credentials and explicit tests in the inline connection component', () => {
    expect(connection).toContain("catalogId: 'custom'");
    expect(connection).toContain('probeProviderConnection');
    expect(connection).toContain('testProviderOnboardingModel');
    expect(connection).toContain('commitProviderOnboarding');
    expect(connection).toContain('onboardingId: probe.value.onboardingId');
    expect(connection).toContain('expiresAt');
    expect(connection).not.toContain('localStorage');
  });
  it('clears raw secrets after probe and on teardown; changes invalidate any prior handle', () => {
    const block = connection.slice(
      connection.indexOf('async function verifyConnection'),
      connection.indexOf('async function refreshModels'),
    );
    expect(block).toContain("apiKey.value = ''");
    expect(block.indexOf("apiKey.value = ''")).toBeGreaterThan(
      block.indexOf('await ai.probeProviderConnection'),
    );
    expect(connection).toContain('onBeforeUnmount');
    expect(connection).toContain('invalidateProbe');
    expect(connection).toContain('probe.value = null');
    expect(connection).not.toContain('apiKey: connection.value');
  });
  it('retains the identity-bound replacement path instead of inventing client-side key writes', () => {
    expect(connection).toContain('ai.probeProviderReplacement(String(currentId), input)');
    expect(connection).toContain('ai.commitProviderReplacement');
    expect(connection).toContain('committedConnection');
    expect(connection).not.toContain('credentialRef:');
    expect(connection).not.toContain('updateProvider(');
  });
  it('persists enable states for every instance through authoritative Revision CAS', () => {
    expect(source).toContain("action: 'update'");
    expect(source).toContain('expectedRevision: instance.revision');
    expect(source).toContain('ai-provider-toggle-');
    expect(source).not.toContain("instance.instanceId !== 'mastra'");
    expect(connection).toContain('ai-provider-detail-toggle');
  });
});
