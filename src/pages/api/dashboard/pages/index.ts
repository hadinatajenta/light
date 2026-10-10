import { z } from 'astro/zod';
import { recordActivity, toUserActor } from '@/lib/activity/record';
import { withAdmin } from '@/lib/api/handler';
import { requireContentDatabase } from '@/lib/content/database';
import { jsonOk, readJsonBody } from '@/lib/http';
import { createPage, listPages } from '@/lib/pages/store';

export const prerender = false;

const MAX_PAYLOAD_BYTES = 1_000_000;

function normalizeOptionalText(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value ?? null;
  }

  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export const pageInputSchema = z.object({
  id: z
    .string()
    .trim()
    .max(60)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers, and single hyphens.'),
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(200).default(''),
  body: z.string().max(200_000).default(''),
  status: z.enum(['draft', 'published']),
  seoTitle: z.preprocess(normalizeOptionalText, z.string().max(120).nullable()),
  canonical: z.preprocess(normalizeOptionalText, z.url().max(2048).nullable()),
  noindex: z.boolean().default(false),
  showInFooter: z.boolean().default(true),
  sortOrder: z.number().int().min(-10_000).max(10_000).default(0),
});

export const GET = withAdmin(async (_context, requestId) => {
  const database = await requireContentDatabase();
  const pages = await listPages(database);

  return jsonOk({ pages }, requestId);
});

export const POST = withAdmin(async ({ request }, requestId, user) => {
  const database = await requireContentDatabase();
  const payload = pageInputSchema.parse(await readJsonBody(request, MAX_PAYLOAD_BYTES));
  const page = await createPage(database, payload);

  await recordActivity({
    ...toUserActor(user),
    action: 'page.created',
    targetType: 'page',
    targetId: page.id,
    summary: `Created page "${page.title}"`,
  });

  return jsonOk({ page }, requestId, 201);
});
