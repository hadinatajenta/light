import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MODEL_PROVIDER,
  defaultModelForProvider,
  getModelProvider,
  isModelAvailableForProvider,
  MODEL_PROVIDER_IDS,
  MODEL_PROVIDERS,
  modelIdsForProvider,
} from './model-providers';

describe('MODEL_PROVIDERS', () => {
  it('keeps the legacy DeepSeek settings key so an existing key survives', () => {
    expect(MODEL_PROVIDERS.deepseek.keySetting).toBe('deepseek_api_key');
  });

  it('gives every provider a distinct settings key', () => {
    const settings = MODEL_PROVIDER_IDS.map((id) => MODEL_PROVIDERS[id].keySetting);
    expect(new Set(settings).size).toBe(settings.length);
  });

  it('gives every provider a distinct base url', () => {
    const baseUrls = MODEL_PROVIDER_IDS.map((id) => MODEL_PROVIDERS[id].baseUrl);
    expect(new Set(baseUrls).size).toBe(baseUrls.length);
  });

  it('offers no empty model list and no duplicate model ids', () => {
    for (const id of MODEL_PROVIDER_IDS) {
      const models = modelIdsForProvider(id);

      expect(models.length).toBeGreaterThan(0);
      expect(new Set(models).size).toBe(models.length);
    }
  });

  it('keeps the two DeepSeek models the agents already used', () => {
    expect(modelIdsForProvider('deepseek')).toEqual(['deepseek-flash', 'deepseek-v4-pro']);
  });

  it('offers the same DeepSeek models through OpenCode Go so an agent can switch without renaming', () => {
    expect(isModelAvailableForProvider('opencode-go', 'deepseek-flash')).toBe(true);
    expect(isModelAvailableForProvider('opencode-go', 'deepseek-v4-pro')).toBe(true);
  });

  it('does not offer a provider-specific model to another provider', () => {
    expect(isModelAvailableForProvider('deepseek', 'kimi-k3')).toBe(false);
  });

  it('resolves the default provider to a model that provider actually serves', () => {
    const model = defaultModelForProvider(DEFAULT_MODEL_PROVIDER);
    expect(isModelAvailableForProvider(DEFAULT_MODEL_PROVIDER, model)).toBe(true);
  });

  it('only advertises json mode where the capability is declared', () => {
    for (const id of MODEL_PROVIDER_IDS) {
      expect(typeof MODEL_PROVIDERS[id].capabilities.supportsJsonMode).toBe('boolean');
    }
  });
});

describe('getModelProvider', () => {
  it('returns the definition for a known provider', () => {
    expect(getModelProvider('opencode-go')?.label).toBe('OpenCode Go');
  });

  it('returns null for an unknown provider instead of throwing', () => {
    expect(getModelProvider('not-a-provider')).toBeNull();
    expect(getModelProvider('')).toBeNull();
  });
});
