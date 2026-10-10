import { ApiError } from '../errors';
import { getSetting, setSetting } from '../settings/store';
import { decryptSecret, encryptSecret, maskSecret } from './secrets';

export { getSetting, setSetting };

export const DEEPSEEK_KEY_SETTING = 'deepseek_api_key';

export interface SecretStatus {
  configured: boolean;
  hint: string | null;
}

export async function saveDeepseekKey(db: D1Database, apiKey: string): Promise<void> {
  await setSetting(db, DEEPSEEK_KEY_SETTING, await encryptSecret(apiKey));
}

export async function readDeepseekKey(db: D1Database): Promise<string | null> {
  const stored = await getSetting(db, DEEPSEEK_KEY_SETTING);
  if (!stored) {
    return null;
  }

  return decryptSecret(stored);
}

export async function describeDeepseekKey(db: D1Database): Promise<SecretStatus> {
  const stored = await getSetting(db, DEEPSEEK_KEY_SETTING);
  if (!stored) {
    return { configured: false, hint: null };
  }

  return { configured: true, hint: maskSecret(await decryptSecret(stored)) };
}

export async function requireDeepseekKey(db: D1Database): Promise<string> {
  const apiKey = await readDeepseekKey(db);
  if (!apiKey) {
    throw new ApiError(
      409,
      'DEEPSEEK_KEY_MISSING',
      'Add your DeepSeek API key before running an agent.',
    );
  }

  return apiKey;
}
