import { recordActivity, toUserActor } from '@/lib/activity/record';
import { verifyProviderKey } from '@/lib/agents/model-client';
import { MODEL_PROVIDER_IDS, MODEL_PROVIDERS } from '@/lib/agents/model-providers';
import { modelProviderKeySchema } from '@/lib/agents/schema';
import { describeProviderKey, describeProviderKeys, saveProviderKey } from '@/lib/agents/settings';
import { withAdmin } from '@/lib/api/handler';
import { requireContentDatabase } from '@/lib/content/database';
import { jsonOk, readJsonBody } from '@/lib/http';

export const prerender = false;

const MAX_BODY_BYTES = 10_000;

export const GET = withAdmin(async (_context, requestId) => {
  const database = await requireContentDatabase();
  const keys = await describeProviderKeys(database);

  const providers = MODEL_PROVIDER_IDS.map((providerId) => {
    const provider = MODEL_PROVIDERS[providerId];

    return {
      id: provider.id,
      label: provider.label,
      billing: provider.billing,
      keyUrl: provider.keyUrl,
      models: [...provider.models],
    };
  });

  return jsonOk({ providers, keys }, requestId);
});

export const PUT = withAdmin(async ({ request }, requestId, user) => {
  const database = await requireContentDatabase();
  const payload = modelProviderKeySchema.parse(
    await readJsonBody<unknown>(request, MAX_BODY_BYTES),
  );
  const provider = MODEL_PROVIDERS[payload.provider];
  const apiKey = payload.apiKey.trim();

  await verifyProviderKey(payload.provider, apiKey);
  await saveProviderKey(database, payload.provider, apiKey);

  const status = await describeProviderKey(database, payload.provider);

  await recordActivity({
    ...toUserActor(user),
    action: 'settings.model_provider_key_updated',
    summary: `Updated the ${provider.label} API key`,
  });

  return jsonOk({ configured: true, hint: status.hint }, requestId);
});
