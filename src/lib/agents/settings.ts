import { ApiError } from '../errors';
import { getSetting, setSetting } from '../settings/store';
import {
  DEFAULT_MODEL_PROVIDER,
  getModelProvider,
  MODEL_PROVIDERS,
  type ModelProviderId,
} from './model-providers';
import { decryptSecret, encryptSecret, maskSecret } from './secrets';

export { getSetting, setSetting };

export interface SecretStatus {
  configured: boolean;
  hint: string | null;
}

export async function saveProviderKey(
  db: D1Database,
  providerId: ModelProviderId,
  apiKey: string,
): Promise<void> {
  const provider = getModelProvider(providerId);

  if (!provider) {
    throw new ApiError(422, 'MODEL_PROVIDER_UNKNOWN', `Unknown model provider "${providerId}".`);
  }

  await setSetting(db, provider.keySetting, await encryptSecret(apiKey));
}

export async function readProviderKey(
  db: D1Database,
  providerId: ModelProviderId,
): Promise<string | null> {
  const provider = getModelProvider(providerId);

  if (!provider) {
    return null;
  }

  const stored = await getSetting(db, provider.keySetting);

  if (!stored) {
    return null;
  }

  return decryptSecret(stored);
}

export async function describeProviderKey(
  db: D1Database,
  providerId: ModelProviderId,
): Promise<SecretStatus> {
  const stored = await getSetting(db, MODEL_PROVIDERS[providerId].keySetting);

  if (!stored) {
    return { configured: false, hint: null };
  }

  return { configured: true, hint: maskSecret(await decryptSecret(stored)) };
}

export async function describeProviderKeys(
  db: D1Database,
): Promise<Record<ModelProviderId, SecretStatus>> {
  const entries = await Promise.all(
    (Object.keys(MODEL_PROVIDERS) as ModelProviderId[]).map(async (providerId) => {
      const status = await describeProviderKey(db, providerId);
      return [providerId, status] as const;
    }),
  );

  return Object.fromEntries(entries) as Record<ModelProviderId, SecretStatus>;
}

export async function requireProviderKey(
  db: D1Database,
  providerId: ModelProviderId,
): Promise<string> {
  const provider = MODEL_PROVIDERS[providerId];
  const apiKey = await readProviderKey(db, providerId);

  if (!apiKey) {
    throw new ApiError(
      409,
      'MODEL_PROVIDER_KEY_MISSING',
      `Add your ${provider.label} API key before running an agent.`,
    );
  }

  return apiKey;
}

export async function requireDefaultProviderKey(db: D1Database): Promise<string> {
  return requireProviderKey(db, DEFAULT_MODEL_PROVIDER);
}
