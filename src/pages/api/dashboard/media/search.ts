import { z } from 'astro/zod';
import { withAdmin } from '@/lib/api/handler';
import { jsonOk } from '@/lib/http';
import { searchImages } from '@/lib/media/search';

export const prerender = false;

const searchQuerySchema = z.object({
  q: z.string().trim().min(2, 'Enter at least 2 characters.').max(120),
  page: z.coerce.number().int().positive().default(1),
});

export const GET = withAdmin(async ({ url }, requestId) => {
  const payload = searchQuerySchema.parse({
    q: url.searchParams.get('q') ?? '',
    page: url.searchParams.get('page') ?? undefined,
  });

  const { results, total } = await searchImages(payload.q, payload.page);

  return jsonOk({ results, total, page: payload.page }, requestId);
});
