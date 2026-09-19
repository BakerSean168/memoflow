import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = dirname(fileURLToPath(import.meta.url));
const FORBIDDEN_LEGACY_SURFACES = [
  'AIService',
  'LangGraph',
  'TurnEngine',
  'ModelGateway',
  'CapabilityResolver',
  'ProposalKernel',
  'AgentAction',
  'dependsOn',
  'AssistantEvent',
] as const;

function productionTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = join(directory, entry.name);
    if (entry.isDirectory()) return productionTypeScriptFiles(target);
    if (
      !entry.name.endsWith('.ts') ||
      entry.name.endsWith('.spec.ts') ||
      entry.name.endsWith('.test.ts')
    ) {
      return [];
    }
    return [target];
  });
}

describe('Mastra vNext architecture lock', () => {
  it('never imports or reuses retired Agent Host / Python runtime language', () => {
    const violations: string[] = [];
    for (const file of productionTypeScriptFiles(ROOT)) {
      const source = readFileSync(file, 'utf8');
      for (const forbidden of FORBIDDEN_LEGACY_SURFACES) {
        if (source.includes(forbidden)) {
          violations.push(`${file.slice(ROOT.length + 1)} -> ${forbidden}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('uses the canonical vNext assistant event contract at the runtime boundary without serializing credentials or raw provider errors', () => {
    const runtime = readFileSync(join(ROOT, 'runtime/mastra-ai.runtime.ts'), 'utf8');
    expect(runtime).toContain('AssistantRuntimeEvent');
    expect(runtime).toContain('assistant.run.started');
    expect(runtime).toContain('assistant.message.delta');
    expect(runtime).toContain('assistant.run.completed');
    expect(runtime).toContain('assistant.run.failed');
    expect(runtime).toContain('assistant.run.cancelled');
    expect(runtime).not.toMatch(/setRaw\(['\"]apiKey['\"]/);
    expect(runtime).not.toContain('event.error.message');
    expect(runtime).not.toMatch(/data:\s*\{[^}]*apiKey/s);
  });

  it('keeps Mastra runtime failure projection independent from server transport', () => {
    const runtime = readFileSync(join(ROOT, 'runtime/mastra-ai.runtime.ts'), 'utf8');

    expect(runtime).toContain("from '../../../shared/ai-public-failure'");
    expect(runtime).not.toMatch(/from\s+['"][^'"]*transport(?:\/[^'"]*)?['"]/);
  });
});
