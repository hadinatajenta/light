import { z } from 'astro/zod';
import { recordActivity, toUserActor } from '@/lib/activity/record';
import {
  deleteTopic,
  getTopic,
  listTopics,
  releaseTopic,
  TOPIC_STATUSES,
} from '@/lib/agents/topics';
import { withAdmin } from '@/lib/api/handler';
import { requireContentDatabase } from '@/lib/content/database';
import { ApiError, jsonOk, readJsonBody } from '@/lib/http';

export const prerender = false;

const updateRequestSchema = z.object({
  status: z.enum(TOPIC_STATUSES),
});

function requireId(params: Record<string, string | undefined>): string {
  const id = params.id;
  if (!id) {
    throw new ApiError(400, 'MISSING_ID', 'The topic id is required.');
  }

  return id;
}

export const GET = withAdmin(async ({ params }, requestId) => {
  const database = await requireContentDatabase();
  const topic = await getTopic(database, requireId(params));

  return jsonOk({ topic }, requestId);
});

export const PUT = withAdmin(async ({ params, request }, requestId, user) => {
  const database = await requireContentDatabase();
  const id = requireId(params);
  const payload = updateRequestSchema.parse(await readJsonBody(request, 5_000));

  if (payload.status === 'queued') {
    await releaseTopic(database, id, 'Requeued by an operator');
  } else {
    await database
      .prepare('UPDATE topics SET status = ?, updated_at = ? WHERE id = ?')
      .bind(payload.status, new Date().toISOString(), id)
      .run();
  }

  const [topic] = await listTopics(database, { limit: 200 }).then((topics) =>
    topics.filter((entry) => entry.id === id),
  );

  await recordActivity({
    ...toUserActor(user),
    action: 'topic.updated',
    targetType: 'topic',
    targetId: id,
    summary: `Set topic to ${payload.status}`,
  });

  return jsonOk({ topic }, requestId);
});

export const DELETE = withAdmin(async ({ params }, requestId, user) => {
  const database = await requireContentDatabase();
  const id = requireId(params);
  await deleteTopic(database, id);

  await recordActivity({
    ...toUserActor(user),
    action: 'topic.deleted',
    targetType: 'topic',
    targetId: id,
    summary: `Deleted topic "${id}"`,
  });

  return jsonOk({ id, deleted: true }, requestId);
});
