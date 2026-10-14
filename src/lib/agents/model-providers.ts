export const MODEL_PROVIDER_IDS = ['deepseek', 'opencode-go'] as const;

export type ModelProviderId = (typeof MODEL_PROVIDER_IDS)[number];

export interface ModelProviderCapabilities {
  supportsThinking: boolean;
  supportsReasoningEffort: boolean;
  supportsJsonMode: boolean;
  supportsUserId: boolean;
}

export interface ModelProviderDefinition {
  id: ModelProviderId;
  label: string;
  baseUrl: string;
  keySetting: string;
  keyUrl: string;
  billing: string;
  models: readonly string[];
  capabilities: ModelProviderCapabilities;
}

export const DEFAULT_MODEL_PROVIDER: ModelProviderId = 'deepseek';

const DEEPSEEK_MODELS = ['deepseek-flash', 'deepseek-v4-pro'] as const;

const OPENCODE_GO_MODELS = [
  'deepseek-flash',
  'deepseek-v4-pro',
  'deepseek-v4-flash',
  'deepseek-v4.1-flash',
  'glm-5.3',
  'glm-5.3-flash',
  'glm-5.2',
  'glm-5.1',
  'kimi-k3',
  'kimi-k2.6',
  'minimax-m3',
  'minimax-m2.7',
  'minimax-m2.5',
  'step-5-preview-free',
  'cat-jam-free',
] as const;

export const MODEL_PROVIDERS: Record<ModelProviderId, ModelProviderDefinition> = {
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    keySetting: 'deepseek_api_key',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    billing: 'Pay per token, billed by DeepSeek.',
    models: DEEPSEEK_MODELS,
    capabilities: {
      supportsThinking: true,
      supportsReasoningEffort: true,
      supportsJsonMode: true,
      supportsUserId: true,
    },
  },
  'opencode-go': {
    id: 'opencode-go',
    label: 'OpenCode Go',
    baseUrl: 'https://opencode.ai/zen/go/v1',
    keySetting: 'opencode_go_api_key',
    keyUrl: 'https://opencode.ai/auth',
    billing: 'Open-source models on a flat monthly subscription.',
    models: OPENCODE_GO_MODELS,
    capabilities: {
      supportsThinking: false,
      supportsReasoningEffort: false,
      supportsJsonMode: true,
      supportsUserId: false,
    },
  },
};

export function getModelProvider(id: string): ModelProviderDefinition | null {
  return MODEL_PROVIDER_IDS.includes(id as ModelProviderId)
    ? MODEL_PROVIDERS[id as ModelProviderId]
    : null;
}

export function modelIdsForProvider(id: ModelProviderId): readonly string[] {
  return MODEL_PROVIDERS[id].models;
}

export function defaultModelForProvider(id: ModelProviderId): string {
  return MODEL_PROVIDERS[id].models[0];
}

export function isModelAvailableForProvider(id: ModelProviderId, model: string): boolean {
  return MODEL_PROVIDERS[id].models.includes(model);
}
