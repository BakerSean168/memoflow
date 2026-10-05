import { describe, expect, it, vi } from 'vitest';
import {
  createAIProviderConfigRepositoryStub,
  createAIProviderConfigServerDTO,
  createAIProviderSecretVaultStub,
} from '../../../testing/ai-test-support';
import { ProviderWebResearchAdapter } from './provider-web-research.adapter';

function response(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const input = {
  identityId: 'identity-1',
  query: '北京大学 2027 计算机考研 招生简章 报名时间',
  intent: 'timeline' as const,
  maxSources: 4,
};

describe('ProviderWebResearchAdapter', () => {
  it('uses OpenRouter server-side web search and projects URL citations', async () => {
    const provider = createAIProviderConfigServerDTO({
      providerDefinitionId: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      defaultModel: 'openai/gpt-5.6',
    });
    const fetch = vi.fn(async () =>
      response({
        choices: [
          {
            message: {
              content: 'The official admissions page lists the current timeline.',
              annotations: [
                {
                  type: 'url_citation',
                  url_citation: {
                    url: 'https://admission.pku.edu.cn/notice',
                    title: 'Peking University admissions notice',
                    content: 'Registration dates and requirements.',
                  },
                },
              ],
            },
          },
        ],
      }),
    );
    const adapter = new ProviderWebResearchAdapter(
      createAIProviderConfigRepositoryStub({ findDefaultByIdentityId: async () => provider }),
      createAIProviderSecretVaultStub(),
      fetch as never,
    );

    const result = await adapter.search(input);

    expect(result).toEqual({
      status: 'grounded',
      evidence: expect.objectContaining({
        intent: 'timeline',
        trust: 'external_untrusted',
        provenance: 'external',
        sources: [
          expect.objectContaining({
            url: 'https://admission.pku.edu.cn/notice',
            title: 'Peking University admissions notice',
          }),
        ],
      }),
    });
    expect(String(fetch.mock.calls[0]?.[0])).toBe('https://openrouter.ai/api/v1/chat/completions');
    const body = JSON.parse(String((fetch.mock.calls[0]?.[1] as RequestInit).body));
    expect(body.model).toBe('openai/gpt-5.6');
    expect(body.tools).toEqual([
      {
        type: 'openrouter:web_search',
        parameters: { max_results: 4, max_total_results: 4, search_context_size: 'low' },
      },
    ]);
  });

  it('uses the OpenAI Responses web_search tool and preserves primary sources', async () => {
    const provider = createAIProviderConfigServerDTO({
      providerDefinitionId: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      defaultModel: 'gpt-5.6',
    });
    const fetch = vi.fn(async () =>
      response({
        output: [
          {
            type: 'message',
            content: [
              {
                type: 'output_text',
                text: 'Official notice summary.',
                annotations: [
                  {
                    type: 'url_citation',
                    url: 'https://admission.pku.edu.cn/official',
                    title: 'Official notice',
                  },
                ],
              },
            ],
          },
          {
            type: 'web_search_call',
            action: {
              sources: [
                {
                  url: 'https://yz.chsi.com.cn/',
                  title: 'China graduate admissions portal',
                },
              ],
            },
          },
        ],
      }),
    );
    const adapter = new ProviderWebResearchAdapter(
      createAIProviderConfigRepositoryStub({ findDefaultByIdentityId: async () => provider }),
      createAIProviderSecretVaultStub(),
      fetch as never,
    );

    const result = await adapter.search(input);

    expect(result.status).toBe('grounded');
    if (result.status === 'grounded') {
      expect(result.evidence.sources.map((item) => item.url)).toEqual([
        'https://admission.pku.edu.cn/official',
        'https://yz.chsi.com.cn/',
      ]);
    }
    expect(String(fetch.mock.calls[0]?.[0])).toBe('https://api.openai.com/v1/responses');
    const body = JSON.parse(String((fetch.mock.calls[0]?.[1] as RequestInit).body));
    expect(body.tools).toEqual([{ type: 'web_search', search_context_size: 'low' }]);
    expect(body.include).toEqual(['web_search_call.action.sources']);
    expect(body.store).toBe(false);
  });

  it('uses Gemini Interactions google_search and inline annotations', async () => {
    const provider = createAIProviderConfigServerDTO({
      providerDefinitionId: 'gemini',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
      defaultModel: 'gemini-3.8-flash',
    });
    const fetch = vi.fn(async () =>
      response({
        output_text: 'Grounded admissions timeline.',
        steps: [
          {
            type: 'model_output',
            content: [
              {
                type: 'text',
                text: 'Grounded admissions timeline.',
                annotations: [
                  {
                    uri: 'https://admission.pku.edu.cn/gemini-source',
                    title: 'Peking University graduate admissions',
                  },
                ],
              },
            ],
          },
        ],
      }),
    );
    const adapter = new ProviderWebResearchAdapter(
      createAIProviderConfigRepositoryStub({ findDefaultByIdentityId: async () => provider }),
      createAIProviderSecretVaultStub(),
      fetch as never,
    );

    const result = await adapter.search(input);

    expect(result.status).toBe('grounded');
    expect(String(fetch.mock.calls[0]?.[0])).toBe(
      'https://generativelanguage.googleapis.com/v1beta/interactions',
    );
    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    expect(init.headers).toMatchObject({ 'x-goog-api-key': 'plain-secret' });
    const body = JSON.parse(String(init.body));
    expect(body.tools).toEqual([{ type: 'google_search' }]);
    expect(body.store).toBe(false);
  });

  it('fails closed for providers without a hosted web-search contract', async () => {
    const provider = createAIProviderConfigServerDTO({
      providerDefinitionId: 'deepseek',
      baseUrl: 'https://api.deepseek.com/v1',
      defaultModel: 'deepseek-chat',
    });
    const fetch = vi.fn();
    const adapter = new ProviderWebResearchAdapter(
      createAIProviderConfigRepositoryStub({ findDefaultByIdentityId: async () => provider }),
      createAIProviderSecretVaultStub(),
      fetch as never,
    );

    await expect(adapter.search(input)).resolves.toEqual({
      status: 'unavailable',
      reason: 'provider_unsupported',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('degrades rate limits instead of failing the Goal workflow', async () => {
    const provider = createAIProviderConfigServerDTO({
      providerDefinitionId: 'openai',
      defaultModel: 'gpt-5.6',
    });
    const fetch = vi.fn(async () => response({ error: { message: 'rate limited' } }, 429));
    const adapter = new ProviderWebResearchAdapter(
      createAIProviderConfigRepositoryStub({ findDefaultByIdentityId: async () => provider }),
      createAIProviderSecretVaultStub(),
      fetch as never,
    );

    await expect(adapter.search(input)).resolves.toEqual({
      status: 'unavailable',
      reason: 'rate_limited',
    });
  });
});
