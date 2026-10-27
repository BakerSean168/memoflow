import type { AIModelInfo } from '@memoflow/ai-contracts';
import { createLogger } from '@memoflow/utils/logger';
import { AIExecutionError } from '../../../shared/ai-execution-error';
import type { ProviderFetch } from '../security/provider-safe-fetch';
import type {
  IAIProviderModelCatalogPort,
  ProviderModelCatalogInput,
} from '../../application/ports';
import {
  normalizeOpenAICompatibleBaseUrl,
  normalizeOpenAICompatibleModelId,
} from '../../shared/openai-compatible-normalize';

interface OpenAICompatibleModelsResponse {
  data?: Array<{
    id?: string;
    name?: string;
    /** Google AI Studio / Gemini OpenAI-compatible catalog uses display_name. */
    display_name?: string;
    description?: string;
    context_window?: number;
    context_length?: number;
    pricing?: {
      prompt?: string | number;
      completion?: string | number;
    };
  }>;
}

type OpenAICompatibleModelRow = NonNullable<OpenAICompatibleModelsResponse['data']>[number];

const EXCLUDED_MODEL_PATTERNS = [
  /embedding/i,
  /whisper/i,
  /transcrib/i,
  /tts/i,
  /moderation/i,
  /dall-e/i,
  /image/i,
  /vision-preview/i,
];

const logger = createLogger('OpenAICompatibleModelCatalogGateway');
const MAX_MODEL_CATALOG_BYTES = 2 * 1024 * 1024;
const MAX_MODEL_CATALOG_ROWS = 2_000;

export class OpenAICompatibleModelCatalogGateway implements IAIProviderModelCatalogPort {
  constructor(private readonly fetchImpl: ProviderFetch) {}

  async listModels(input: ProviderModelCatalogInput): Promise<AIModelInfo[]> {
    const modelsUrl = buildModelsUrl(input.baseUrl);
    logger.info('Loading provider model catalog', {
      baseUrl: input.baseUrl,
      modelsUrl,
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await this.fetchImpl(modelsUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${input.apiKey}`,
          'Content-Type': 'application/json',
        },
        redirect: 'manual',
        signal: controller.signal,
      });

      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel().catch(() => undefined);
        throw new AIExecutionError(
          'transport',
          'Provider model discovery redirected unexpectedly',
          {
            statusCode: response.status,
          },
        );
      }

      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        const category =
          response.status === 401 || response.status === 403
            ? 'unauthorized'
            : response.status === 429
              ? 'rate_limited'
              : response.status >= 500
                ? 'upstream_provider_error'
                : 'transport';
        throw new AIExecutionError(category, 'Failed to load provider models', {
          statusCode: response.status,
        });
      }

      const payload = await readModelCatalogPayload(response);
      if (!Array.isArray(payload.data)) {
        throw new AIExecutionError(
          'upstream_provider_error',
          'Provider returned a malformed model catalog',
        );
      }
      if (payload.data.length > MAX_MODEL_CATALOG_ROWS) {
        throw new AIExecutionError(
          'upstream_provider_error',
          `Provider model catalog exceeds ${MAX_MODEL_CATALOG_ROWS} entries`,
        );
      }
      const models = payload.data
        .map((row) => normalizeModel(row))
        .filter((row): row is AIModelInfo => Boolean(row))
        .sort((left, right) => left.name.localeCompare(right.name));

      logger.info('Provider model catalog loaded', {
        baseUrl: input.baseUrl,
        modelCount: models.length,
        sampleModelIds: models.slice(0, 10).map((model) => model.id),
      });

      return models;
    } catch (cause) {
      if (cause instanceof AIExecutionError) throw cause;
      if (cause instanceof Error && cause.name === 'AbortError') {
        throw new AIExecutionError('timeout', 'Provider model discovery timed out', { cause });
      }
      throw new AIExecutionError('transport', 'Provider model discovery failed', { cause });
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

async function readModelCatalogPayload(
  response: Response,
): Promise<OpenAICompatibleModelsResponse> {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_MODEL_CATALOG_BYTES) {
    await response.body?.cancel().catch(() => undefined);
    throw new AIExecutionError(
      'upstream_provider_error',
      'Provider model catalog response is too large',
    );
  }

  if (!response.body) {
    throw new AIExecutionError(
      'upstream_provider_error',
      'Provider returned an empty model catalog response',
    );
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > MAX_MODEL_CATALOG_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new AIExecutionError(
          'upstream_provider_error',
          'Provider model catalog response is too large',
        );
      }
      chunks.push(value);
    }
  } catch (cause) {
    if (cause instanceof AIExecutionError) throw cause;
    throw new AIExecutionError('transport', 'Failed to read provider model catalog', { cause });
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as OpenAICompatibleModelsResponse;
  } catch (cause) {
    throw new AIExecutionError(
      'upstream_provider_error',
      'Provider returned malformed model catalog JSON',
      {
        cause,
      },
    );
  }
}

function buildModelsUrl(baseUrl: string): string {
  return new URL('models', normalizeOpenAICompatibleBaseUrl(baseUrl)).toString();
}

function normalizeModel(row: OpenAICompatibleModelRow): AIModelInfo | null {
  const rawId = row.id?.trim();
  if (!rawId || EXCLUDED_MODEL_PATTERNS.some((pattern) => pattern.test(rawId))) {
    return null;
  }

  // Gemini catalog IDs often look like "models/gemini-2.0-flash"; strip for chat/completions.
  const id = normalizeOpenAICompatibleModelId(rawId);
  if (!id || EXCLUDED_MODEL_PATTERNS.some((pattern) => pattern.test(id))) {
    return null;
  }

  const displayName = row.display_name?.trim() || row.name?.trim() || id;

  return {
    id,
    name: displayName,
    description: row.description?.trim() || undefined,
    contextWindow: normalizeNumber(row.context_window ?? row.context_length),
    inputCostPer1M: normalizePrice(row.pricing?.prompt),
    outputCostPer1M: normalizePrice(row.pricing?.completion),
  };
}

function normalizeNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function normalizePrice(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value * 1_000_000;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed * 1_000_000 : undefined;
  }

  return undefined;
}
