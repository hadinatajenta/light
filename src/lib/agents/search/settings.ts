import { getSetting, setSetting } from '../../settings/store';
import { decryptSecret, encryptSecret, maskSecret } from '../secrets';
import { isSearchProviderId, type SearchProviderId } from './types';

export const SEARCH_PROVIDER_SETTING = 'search_provider';
export const SEARCH_KEY_SETTING = 'search_api_key';
export const SEARCH_UNVERIFIED_SETTING = 'search_allow_unverified';

export interface SearchConfig {
  providerId: SearchProviderId | null;
  apiKey: string | null;
  allowUnverified: boolean;
}

export interface SearchStatus {
  configured: boolean;
  provider: SearchProviderId | null;
  hint: string | null;
  allowUnverified: boolean;
}

export async function readSearchConfig(db: D1Database): Promise<SearchConfig> {
  const [providerValue, keyValue, unverifiedValue] = await Promise.all([
    getSetting(db, SEARCH_PROVIDER_SETTING),
    getSetting(db, SEARCH_KEY_SETTING),
    getSetting(db, SEARCH_UNVERIFIED_SETTING),
  ]);

  let apiKey: string | null = null;
  if (keyValue) {
    try {
      apiKey = await decryptSecret(keyValue);
    } catch {
      apiKey = null;
    }
  }

  return {
    providerId: providerValue && isSearchProviderId(providerValue) ? providerValue : null,
    apiKey,
    allowUnverified: unverifiedValue === 'true',
  };
}

export async function saveSearchProvider(
  db: D1Database,
  providerId: SearchProviderId,
  apiKey: string | null,
): Promise<void> {
  await setSetting(db, SEARCH_PROVIDER_SETTING, providerId);

  if (apiKey) {
    await setSetting(db, SEARCH_KEY_SETTING, await encryptSecret(apiKey));
  }
}

export async function setSearchAllowUnverified(db: D1Database, value: boolean): Promise<void> {
  await setSetting(db, SEARCH_UNVERIFIED_SETTING, value ? 'true' : 'false');
}

export async function describeSearchConfig(db: D1Database): Promise<SearchStatus> {
  const config = await readSearchConfig(db);

  return {
    configured:
      config.providerId !== null && (config.apiKey !== null || config.providerId === 'fixture'),
    provider: config.providerId,
    hint: config.apiKey ? maskSecret(config.apiKey) : null,
    allowUnverified: config.allowUnverified,
  };
}
