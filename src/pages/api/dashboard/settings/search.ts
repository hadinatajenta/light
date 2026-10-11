import { z } from 'astro/zod';
import { recordActivity, toUserActor } from '@/lib/activity/record';
import { getSearchProvider } from '@/lib/agents/search/registry';
import {
  describeSearchConfig,
  saveSearchProvider,
  setSearchAllowUnverified,
} from '@/lib/agents/search/settings';
import { SEARCH_PROVIDER_IDS, type SearchProviderId } from '@/lib/agents/search/types';
import { withAdmin } from '@/lib/api/handler';
import { requireContentDatabase } from '@/lib/content/database';
import { ApiError, jsonOk, readJsonBody } from '@/lib/http';

export const prerender = false;

const PROBE_QUERY = 'office chair ergonomics standards';
const PROBE_LIMIT = 1;

const searchSettingsSchema = z.object({
  provider: z.enum(SEARCH_PROVIDER_IDS),
  apiKey: z.string().min(8).max(400).optional(),
  allowUnverified: z.boolean().optional(),
});

export const GET = withAdmin(async (_context, requestId) => {
  const database = await requireContentDatabase();
  const status = await describeSearchConfig(database);

  return jsonOk(status, requestId);
});

export const PUT = withAdmin(async ({ request }, requestId, user) => {
  const database = await requireContentDatabase();
  const payload = searchSettingsSchema.parse(await readJsonBody(request, 20_000));
  const apiKey = payload.apiKey?.trim() || null;

  if (apiKey) {
    const provider = getSearchProvider(payload.provider as SearchProviderId);
    try {
      await provider.search({ query: PROBE_QUERY, limit: PROBE_LIMIT, apiKey });
    } catch (error) {
      if (error instanceof ApiError) {
        throw new ApiError(422, 'SEARCH_KEY_INVALID', 'The search provider rejected that API key.');
      }
      throw error;
    }
  }

  await saveSearchProvider(database, payload.provider as SearchProviderId, apiKey);

  if (typeof payload.allowUnverified === 'boolean') {
    await setSearchAllowUnverified(database, payload.allowUnverified);
  }

  const status = await describeSearchConfig(database);

  await recordActivity({
    ...toUserActor(user),
    action: 'settings.search_provider_updated',
    summary: `Updated the search provider to ${status.provider ?? 'none'}`,
  });

  return jsonOk(status, requestId);
});
