import { z } from 'astro/zod';
import { withAdmin } from '@/lib/api/handler';
import { requireContentDatabase } from '@/lib/content/database';
import { jsonOk, readJsonBody } from '@/lib/http';
import {
  MAX_REFRESH_DAYS,
  MIN_REFRESH_DAYS,
  readSeoRefreshDays,
  saveSeoRefreshDays,
} from '@/lib/seo/settings';

export const prerender = false;

const refreshWindowSchema = z.object({
  refreshAfterDays: z.number().int(),
});

export const GET = withAdmin(async (_context, requestId) => {
  const database = await requireContentDatabase();
  const refreshAfterDays = await readSeoRefreshDays(database);

  return jsonOk({ refreshAfterDays, min: MIN_REFRESH_DAYS, max: MAX_REFRESH_DAYS }, requestId);
});

export const POST = withAdmin(async ({ request }, requestId) => {
  const database = await requireContentDatabase();
  const payload = refreshWindowSchema.parse(await readJsonBody(request, 5_000));
  const refreshAfterDays = await saveSeoRefreshDays(database, payload.refreshAfterDays);

  return jsonOk({ refreshAfterDays }, requestId);
});
