import { OpenAICompatibleModelCatalogGateway } from './openai-compatible-model-catalog.gateway';

describe('OpenAICompatibleModelCatalogGateway', () => {
  it('normalizes Gemini catalog ids and prefers display_name', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              id: 'models/gemini-2.5-flash',
              name: 'gemini-2.5-flash',
              display_name: 'Gemini 2.5 Flash',
              context_window: 1_048_576,
            },
            { id: 'models/text-embedding-004', display_name: 'Embedding' },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const models = await new OpenAICompatibleModelCatalogGateway(
      fetchMock as typeof fetch,
    ).listModels({
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai///',
      apiKey: 'test-key',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/openai/models',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(models).toEqual([
      expect.objectContaining({
        id: 'gemini-2.5-flash',
        name: 'Gemini 2.5 Flash',
        contextWindow: 1_048_576,
      }),
    ]);
  });

  it('converts provider per-token pricing into USD per 1M tokens', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              id: 'openai/gpt-test',
              pricing: { prompt: '0.0000025', completion: '0.00001' },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const [model] = await new OpenAICompatibleModelCatalogGateway(
      fetchMock as typeof fetch,
    ).listModels({
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'test-key',
    });

    expect(model?.inputCostPer1M).toBe(2.5);
    expect(model?.outputCostPer1M).toBe(10);
  });

  it('rejects malformed JSON as a typed upstream provider error', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response('{not-json', { status: 200, headers: { 'Content-Type': 'application/json' } }),
      );

    await expect(
      new OpenAICompatibleModelCatalogGateway(fetchMock as typeof fetch).listModels({
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'test-key',
      }),
    ).rejects.toMatchObject({ category: 'upstream_provider_error' });
  });

  it('rejects a declared model catalog larger than 2 MiB without reading the body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('{"data":[]}', {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': String(2 * 1024 * 1024 + 1),
        },
      }),
    );

    await expect(
      new OpenAICompatibleModelCatalogGateway(fetchMock as typeof fetch).listModels({
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'test-key',
      }),
    ).rejects.toMatchObject({ category: 'upstream_provider_error' });
  });

  it('rejects provider catalogs above the 2000-model product bound', async () => {
    const data = Array.from({ length: 2_001 }, (_, index) => ({ id: `model-${index}` }));
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(
      new OpenAICompatibleModelCatalogGateway(fetchMock as typeof fetch).listModels({
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'test-key',
      }),
    ).rejects.toMatchObject({ category: 'upstream_provider_error' });
  });

  it('rejects a 200 response with a non-array data shape instead of treating it as empty', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: 'not-an-array' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(
      new OpenAICompatibleModelCatalogGateway(fetchMock as typeof fetch).listModels({
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'test-key',
      }),
    ).rejects.toMatchObject({ category: 'upstream_provider_error' });
  });
});
