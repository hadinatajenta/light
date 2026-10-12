import { z } from 'astro/zod';
import { withAdmin } from '@/lib/api/handler';
import { requireContentDatabase } from '@/lib/content/database';
import { jsonOk } from '@/lib/http';
import { searchImagesWithFallback } from '@/lib/media/providers/registry';
import { readPexelsKey } from '@/lib/media/settings';

export const prerender = false;

const searchQuerySchema = z.object({
  q: z.string().trim().min(2, 'Enter at least 2 characters.').max(120),
  page: z.coerce.number().int().positive().default(1),
});

export const GET = withAdmin(async ({ url }, requestId) => {
  const database = await requireContentDatabase();
  const payload = searchQuerySchema.parse({
    q: url.searchParams.get('q') ?? '',
    page: url.searchParams.get('page') ?? undefined,
  });

  const pexelsKey = await readPexelsKey(database);
  const { results, total, provider } = await searchImagesWithFallback({
    query: payload.q,
    page: payload.page,
    pexelsKey,
  });

  return jsonOk({ results, total, page: payload.page, provider }, requestId);
});
