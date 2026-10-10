import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('AISettings Provider onboarding V2 surface', () => {
  const source = readFileSync(resolve(__dirname, 'AISettings.vue'), 'utf8');

  it('removes the Quick Provider/template bootstrap path', () => {
    expect(source).not.toContain('AI_PROVIDER_TEMPLATES');
    expect(source).not.toContain('submitQuickProvider');
    expect(source).not.toContain('quickProvider');
  });

  it('uses the four-step onboarding flow and opaque commit handle', () => {
    expect(source).toContain("type OnboardingStep = 'picker' | 'connection' | 'model' | 'review'");
    expect(source).toContain('probeProviderConnection');
    expect(source).toContain('testProviderOnboardingModel');
    expect(source).toContain('commitProviderOnboarding');
    expect(source).toContain('onboardingId: probeResult.value.onboardingId');
  });

  it('clears the raw API key immediately after a successful probe', () => {
    const probeBlock = source.slice(source.indexOf('async function probeConnection()'), source.indexOf('function selectModel'));
    expect(probeBlock).toContain("connectionApiKey.value = ''");
    expect(probeBlock.indexOf("connectionApiKey.value = ''")).toBeGreaterThan(probeBlock.indexOf('await probeProviderConnection'));
  });

  it('reuses the same opaque-handle wizard for identity-bound Provider connection replacement', () => {
    expect(source).toContain("type OnboardingMode = 'create' | 'replace'");
    expect(source).toContain('openProviderReplacement(selectedProvider)');
    expect(source).toContain('probeProviderReplacement');
    expect(source).toContain('commitProviderReplacement');
    expect(source).toContain("onboardingMode.value === 'replace'");
    expect(source).toContain('replacementProvider.value.id');
    expect(source).toContain('onboardingId: probeResult.value.onboardingId');
    expect(source).toContain('data-testid="ai-provider-replacement-preserved-metadata"');
  });

  it('never restores the raw secret when replacement goes back from model selection', () => {
    const probeBlock = source.slice(source.indexOf('async function probeConnection()'), source.indexOf('function selectModel'));
    expect(probeBlock).toContain("connectionApiKey.value = ''");
    const backBlock = source.slice(source.indexOf('function goBack()'), source.indexOf('async function handleSetDefault'));
    expect(backBlock).toContain("connectionApiKey.value = ''");
    expect(backBlock).toContain('probeResult.value = null');
  });

  it('keeps saved Provider connection testing on the identity-bound server path', () => {
    expect(source).toContain('handleTestProvider(String(selectedProvider.id))');
    expect(source).toContain('testProvider({ providerId: providerId as never })');
    expect(source).not.toContain('apiKey: provider.apiKey');
  });

  it('ranks recommendations without auto-selecting one as the persisted default', () => {
    expect(source).toContain('recommendedModelIds');
    expect(source).not.toMatch(/selectedModelId\.value\s*=\s*.*recommendedModelIds/);
    expect(source).toContain('@click="selectModel(model.id)"');
  });
});
