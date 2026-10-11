import { z } from 'astro/zod';
import { recordActivity, toUserActor } from '@/lib/activity/record';
import {
  countTopics,
  createTopic,
  listTopics,
  TOPIC_INTENTS,
  TOPIC_STATUSES,
} from '@/lib/agents/topics';
import { withAdmin } from '@/lib/api/handler';
import { requireContentDatabase } from '@/lib/content/database';
import { jsonOk, readJsonBody } from '@/lib/http';

export const prerender = false;

const topicInputSchema = z.object({
  title: z.string().min(10).max(140),
  keywords: z.array(z.string().min(1).max(60)).max(12).default([]),
  category: z.string().max(60).nullable().default(null),
  intent: z.enum(TOPIC_INTENTS).nullable().default(null),
});

const bulkRequestSchema = z.object({
  lines: z.string().min(1).max(20_000),
  category: z.string().max(60).nullable().default(null),
});

const statusSchema = z.enum(TOPIC_STATUSES);

export const GET = withAdmin(async ({ url }, requestId) => {
  const database = await requireContentDatabase();
  const statusParam = url.searchParams.get('status');
  const parsedStatus = statusSchema.safeParse(statusParam);

  const [topics, counts] = await Promise.all([
    listTopics(database, {
      status: parsedStatus.success ? parsedStatus.data : undefined,
      limit: 200,
    }),
    countTopics(database),
  ]);

  return jsonOk({ topics, counts }, requestId);
});

export const POST = withAdmin(async ({ request }, requestId, user) => {
  const database = await requireContentDatabase();
  const raw = await readJsonBody<Record<string, unknown>>(request, 40_000);

  if (typeof raw.lines === 'string') {
    const payload = bulkRequestSchema.parse(raw);
    const titles = payload.lines
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length >= 10);

    const created = [];
    for (const title of titles) {
      created.push(
        await createTopic(database, {
          title,
          keywords: [],
          category: payload.category,
          intent: null,
        }),
      );
    }

    await recordActivity({
      ...toUserActor(user),
      action: 'topic.imported',
      targetType: 'topic',
      targetId: null,
      summary: `Imported ${created.length} topic(s)`,
    });

    return jsonOk({ created: created.length, topics: created }, requestId, 201);
  }

  const payload = topicInputSchema.parse(raw);
  const topic = await createTopic(database, payload);

  await recordActivity({
    ...toUserActor(user),
    action: 'topic.created',
    targetType: 'topic',
    targetId: topic.id,
    summary: `Queued topic "${topic.title}"`,
  });

  return jsonOk({ topic }, requestId, 201);
});
