import { z } from 'astro/zod';
import { recordActivity, toUserActor } from '@/lib/activity/record';
import { withAdmin } from '@/lib/api/handler';
import { requireContentDatabase } from '@/lib/content/database';
import { jsonOk, readJsonBody } from '@/lib/http';
import { createRedirect, listRedirects } from '@/lib/redirects/store';

export const prerender = false;

const redirectBodySchema = z.object({
  fromPath: z.string().min(1).max(500),
  toPath: z.string().min(1).max(2000),
  statusCode: z.union([z.literal(301), z.literal(302), z.literal(307), z.literal(308)]),
  isActive: z.boolean().default(true),
  note: z.string().max(200).nullable().default(null),
});

export const GET = withAdmin(async (_context, requestId) => {
  const database = await requireContentDatabase();
  const redirects = await listRedirects(database);

  return jsonOk({ redirects }, requestId);
});

export const POST = withAdmin(async ({ request }, requestId, user) => {
  const database = await requireContentDatabase();
  const payload = redirectBodySchema.parse(await readJsonBody(request, 20_000));
  const redirect = await createRedirect(database, payload);

  await recordActivity({
    ...toUserActor(user),
    action: 'redirect.created',
    targetType: 'redirect',
    targetId: redirect.id,
    summary: `Created redirect from ${redirect.fromPath} to ${redirect.toPath}`,
  });

  return jsonOk({ redirect }, requestId, 201);
});
