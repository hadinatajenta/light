import { recordActivity, toUserActor } from '@/lib/activity/record';
import { withAdmin } from '@/lib/api/handler';
import { requireContentDatabase } from '@/lib/content/database';
import { ApiError, jsonOk, readJsonBody } from '@/lib/http';
import { deletePage, getPage, updatePage } from '@/lib/pages/store';
import { pageInputSchema } from './index';

export const prerender = false;

const MAX_PAYLOAD_BYTES = 1_000_000;

function requireId(params: Record<string, string | undefined>): string {
  const id = params.id;
  if (!id) {
    throw new ApiError(400, 'MISSING_ID', 'The page id is required.');
  }

  return id;
}

export const GET = withAdmin(async ({ params }, requestId) => {
  const database = await requireContentDatabase();
  const page = await getPage(database, requireId(params));

  return jsonOk({ page }, requestId);
});

export const PUT = withAdmin(async ({ params, request }, requestId, user) => {
  const database = await requireContentDatabase();
  const id = requireId(params);
  const payload = pageInputSchema.parse(await readJsonBody(request, MAX_PAYLOAD_BYTES));
  const page = await updatePage(database, id, payload);

  await recordActivity({
    ...toUserActor(user),
    action: 'page.updated',
    targetType: 'page',
    targetId: page.id,
    summary: `Updated page "${page.title}"`,
  });

  return jsonOk({ page }, requestId);
});

export const DELETE = withAdmin(async ({ params }, requestId, user) => {
  const database = await requireContentDatabase();
  const id = requireId(params);
  await deletePage(database, id);

  await recordActivity({
    ...toUserActor(user),
    action: 'page.deleted',
    targetType: 'page',
    targetId: id,
    summary: `Deleted page "${id}"`,
  });

  return jsonOk({ id, deleted: true }, requestId);
});
