import type { AIModelInfo } from '@memoflow/ai-contracts';

export interface ProviderModelCatalogInput {
  baseUrl: string;
  apiKey: string;
}

export interface IAIProviderModelCatalogPort {
  listModels(input: ProviderModelCatalogInput): Promise<AIModelInfo[]>;
}
