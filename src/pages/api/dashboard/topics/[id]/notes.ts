import { z } from 'astro/zod';
import { recordActivity, toUserActor } from '@/lib/activity/record';
import { createSource, listSources, SOURCE_KINDS } from '@/lib/agents/sources';
import { getTopic } from '@/lib/agents/topics';
import { withAdmin } from '@/lib/api/handler';
import { requireContentDatabase } from '@/lib/content/database';
import { ApiError, jsonOk, readJsonBody } from '@/lib/http';

export const prerender = false;

const noteInputSchema = z.object({
  heading: z.string().min(3).max(140),
  detail: z.string().min(3).max(2000),
  reference: z.string().max(200).nullable().default(null),
  kind: z.enum(SOURCE_KINDS).default('note'),
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
  const topicId = requireId(params);
  const topic = await getTopic(database, topicId);
  const notes = await listSources(database, topicId);

  return jsonOk({ topic, notes }, requestId);
});

export const POST = withAdmin(async ({ params, request }, requestId, user) => {
  const database = await requireContentDatabase();
  const topicId = requireId(params);
  await getTopic(database, topicId);

  const payload = noteInputSchema.parse(await readJsonBody(request, 20_000));
  const note = await createSource(database, {
    topicId,
    agentId: null,
    kind: payload.kind,
    heading: payload.heading,
    detail: payload.detail,
    reference: payload.reference,
  });

  await recordActivity({
    ...toUserActor(user),
    action: 'source.created',
    targetType: 'topic',
    targetId: topicId,
    summary: `Added a research note: "${payload.heading}"`,
  });

  return jsonOk({ note }, requestId, 201);
});
