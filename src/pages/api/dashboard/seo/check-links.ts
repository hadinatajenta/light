import { z } from 'astro/zod';
import { withAdmin } from '@/lib/api/handler';
import { requireContentDatabase } from '@/lib/content/database';
import { jsonOk, readJsonBody } from '@/lib/http';
import { checkLinks, DEFAULT_LINK_CHECK_LIMIT, extractExternalLinks } from '@/lib/seo/link-check';

export const prerender = false;

const checkLinksRequestSchema = z.object({
  limit: z.number().int().min(1).max(200).optional(),
});

interface PublishedBodyRow {
  id: string;
  body: string;
}

export const POST = withAdmin(async ({ request, site }, requestId) => {
  const database = await requireContentDatabase();
  const payload = checkLinksRequestSchema.parse(await readJsonBody(request, 10_000));
  const origin = site?.origin ?? new URL(request.url).origin;
  const limit = payload.limit ?? DEFAULT_LINK_CHECK_LIMIT;

  const result = await database
    .prepare(`SELECT id, body FROM posts WHERE status = 'published'`)
    .all<PublishedBodyRow>();

  const bodies = (result.results ?? []).map((row) => ({ id: row.id, body: row.body }));
  const urls = extractExternalLinks(bodies, origin);
  const results = await checkLinks(urls, { limit });

  if (results.length > 0) {
    const checkedAt = new Date().toISOString();
    const statements = results.map((entry) =>
      database
        .prepare(
          `INSERT INTO seo_link_checks (url, status_code, ok, error, checked_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(url) DO UPDATE SET
             status_code = excluded.status_code,
             ok = excluded.ok,
             error = excluded.error,
             checked_at = excluded.checked_at`,
        )
        .bind(entry.url, entry.statusCode, entry.ok ? 1 : 0, entry.error, checkedAt),
    );

    await database.batch(statements);
  }

  return jsonOk(
    {
      checked: results.length,
      broken: results.filter((entry) => !entry.ok).length,
      remaining: Math.max(0, urls.length - results.length),
    },
    requestId,
  );
});
