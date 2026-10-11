import { z } from 'astro/zod';
import { recordActivity, toUserActor } from '@/lib/activity/record';
import { withAdmin } from '@/lib/api/handler';
import { requireContentDatabase } from '@/lib/content/database';
import { ApiError, jsonOk, readJsonBody } from '@/lib/http';
import { deleteRedirect, updateRedirect } from '@/lib/redirects/store';

export const prerender = false;

const redirectBodySchema = z.object({
  fromPath: z.string().min(1).max(500),
  toPath: z.string().min(1).max(2000),
  statusCode: z.union([z.literal(301), z.literal(302), z.literal(307), z.literal(308)]),
  isActive: z.boolean().default(true),
  note: z.string().max(200).nullable().default(null),
});

function requireId(params: Record<string, string | undefined>): string {
  const id = params.id;
  if (!id) {
    throw new ApiError(400, 'MISSING_ID', 'The redirect id is required.');
  }

  return id;
}

export const PUT = withAdmin(async ({ params, request }, requestId, user) => {
  const database = await requireContentDatabase();
  const id = requireId(params);
  const payload = redirectBodySchema.parse(await readJsonBody(request, 20_000));
  const redirect = await updateRedirect(database, id, payload);

  await recordActivity({
    ...toUserActor(user),
    action: 'redirect.updated',
    targetType: 'redirect',
    targetId: redirect.id,
    summary: `Updated redirect from ${redirect.fromPath} to ${redirect.toPath}`,
  });

  return jsonOk({ redirect }, requestId);
});

export const DELETE = withAdmin(async ({ params }, requestId, user) => {
  const database = await requireContentDatabase();
  const id = requireId(params);
  const redirect = await deleteRedirect(database, id);

  await recordActivity({
    ...toUserActor(user),
    action: 'redirect.deleted',
    targetType: 'redirect',
    targetId: redirect.id,
    summary: `Deleted redirect from ${redirect.fromPath}`,
  });

  return jsonOk({ id, deleted: true }, requestId);
});
