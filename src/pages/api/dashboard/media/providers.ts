import { z } from 'astro/zod';
import { withAdmin } from '@/lib/api/handler';
import { requireContentDatabase } from '@/lib/content/database';
import { ApiError, jsonOk, readJsonBody } from '@/lib/http';
import { searchPexelsImages } from '@/lib/media/providers/pexels';
import { describeImageProviders, savePexelsKey } from '@/lib/media/settings';

export const prerender = false;

const PROBE_QUERY = 'office desk';
const PROBE_PAGE = 1;

const providerSettingsSchema = z.object({
  pexelsKey: z.string().trim().min(10).max(200).nullable(),
});

export const GET = withAdmin(async (_context, requestId) => {
  const database = await requireContentDatabase();
  const providers = await describeImageProviders(database);

  return jsonOk({ providers }, requestId);
});

export const POST = withAdmin(async ({ request }, requestId) => {
  const database = await requireContentDatabase();
  const payload = providerSettingsSchema.parse(await readJsonBody(request, 5_000));
  const apiKey = payload.pexelsKey?.trim() || null;

  if (apiKey) {
    try {
      await searchPexelsImages(PROBE_QUERY, PROBE_PAGE, apiKey);
    } catch (error) {
      if (error instanceof ApiError) {
        throw new ApiError(
          422,
          'IMAGE_PROVIDER_KEY_INVALID',
          'The image provider rejected that API key.',
        );
      }
      throw error;
    }
  }

  await savePexelsKey(database, apiKey);
  const providers = await describeImageProviders(database);

  return jsonOk({ providers }, requestId);
});
