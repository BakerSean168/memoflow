import { AIProviderType } from '../value-objects/ai-provider-type';

export interface AIProviderTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  providerType: typeof AIProviderType.OpenAICompatible;
  baseUrl: string;
  authType: 'bearer';
  apiKeyUrl?: string;
  hasFreeQuota: boolean;
  freeQuotaNote?: string;
  defaultModel: string;
  recommendedModels?: string[];
  supportsModelList: boolean;
}

export const AI_PROVIDER_TEMPLATES: AIProviderTemplate[] = [
  {
    id: 'gemini',
    name: 'Gemini',
    description: 'Official Gemini API via Google OpenAI-compatible endpoint',
    icon: 'mdi-google',
    color: '#2563eb',
    providerType: AIProviderType.OpenAICompatible,
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    authType: 'bearer',
    apiKeyUrl: 'https://aistudio.google.com/app/apikey',
    hasFreeQuota: true,
    freeQuotaNote: 'Free API keys are available in Google AI Studio',
    defaultModel: 'gemini-2.5-flash',
    recommendedModels: ['gemini-2.5-flash', 'gemini-2.5-pro'],
    supportsModelList: true,
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'OpenAI-compatible multi-model gateway',
    icon: 'mdi-router-wireless',
    color: '#2563eb',
    providerType: AIProviderType.OpenAICompatible,
    baseUrl: 'https://openrouter.ai/api/v1',
    authType: 'bearer',
    apiKeyUrl: 'https://openrouter.ai/keys',
    hasFreeQuota: true,
    freeQuotaNote: 'Some free models are available',
    defaultModel: 'google/gemini-2.5-flash',
    recommendedModels: ['google/gemini-2.5-flash', 'openai/gpt-4o-mini'],
    supportsModelList: true,
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'Official OpenAI API',
    icon: 'mdi-head-snowflake',
    color: '#10a37f',
    providerType: AIProviderType.OpenAICompatible,
    baseUrl: 'https://api.openai.com/v1',
    authType: 'bearer',
    apiKeyUrl: 'https://platform.openai.com/api-keys',
    hasFreeQuota: false,
    defaultModel: 'gpt-4o-mini',
    recommendedModels: ['gpt-4o-mini', 'gpt-4o'],
    supportsModelList: true,
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    description: 'OpenAI-compatible DeepSeek endpoint',
    icon: 'mdi-brain',
    color: '#1d4ed8',
    providerType: AIProviderType.OpenAICompatible,
    baseUrl: 'https://api.deepseek.com/v1',
    authType: 'bearer',
    apiKeyUrl: 'https://platform.deepseek.com/api_keys',
    hasFreeQuota: true,
    freeQuotaNote: 'Free credits may be available for new users',
    defaultModel: 'deepseek-chat',
    recommendedModels: ['deepseek-chat'],
    supportsModelList: true,
  },
  {
    id: 'custom',
    name: 'Custom',
    description: 'Any OpenAI-compatible API endpoint',
    icon: 'mdi-cog',
    color: '#6b7280',
    providerType: AIProviderType.OpenAICompatible,
    baseUrl: '',
    authType: 'bearer',
    hasFreeQuota: false,
    defaultModel: 'gpt-4o-mini',
    supportsModelList: true,
  },
];

/** AI provider template lookup. Goal product templates were retired by GOAL-7210. */
export function getTemplateById(id: string): AIProviderTemplate | undefined {
  return AI_PROVIDER_TEMPLATES.find((template) => template.id === id);
}

export function getTemplatesByType(
  type: typeof AIProviderType.OpenAICompatible,
): AIProviderTemplate[] {
  return AI_PROVIDER_TEMPLATES.filter((template) => template.providerType === type);
}

export function getFreeTemplates(): AIProviderTemplate[] {
  return AI_PROVIDER_TEMPLATES.filter((template) => template.hasFreeQuota);
}
