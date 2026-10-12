import { decryptSecret, encryptSecret, maskSecret } from '../agents/secrets';
import { getSetting, setSetting } from '../settings/store';
import { IMAGE_PROVIDERS, type ImageProviderId } from './providers/registry';

export const MEDIA_PEXELS_KEY_SETTING = 'media_pexels_key';

export interface ImageProviderStatus {
  id: ImageProviderId;
  label: string;
  configured: boolean;
  hint: string | null;
}

export async function readPexelsKey(db: D1Database): Promise<string | null> {
  const stored = await getSetting(db, MEDIA_PEXELS_KEY_SETTING);
  if (!stored) {
    return null;
  }

  try {
    return await decryptSecret(stored);
  } catch {
    return null;
  }
}

export async function savePexelsKey(db: D1Database, apiKey: string | null): Promise<void> {
  const value = apiKey ? await encryptSecret(apiKey) : '';
  await setSetting(db, MEDIA_PEXELS_KEY_SETTING, value);
}

export async function describeImageProviders(db: D1Database): Promise<ImageProviderStatus[]> {
  const apiKey = await readPexelsKey(db);

  return IMAGE_PROVIDERS.map((provider) => ({
    id: provider.id,
    label: provider.label,
    configured: provider.requiresKey ? apiKey !== null : true,
    hint: provider.id === 'pexels' && apiKey ? maskSecret(apiKey) : null,
  }));
}
