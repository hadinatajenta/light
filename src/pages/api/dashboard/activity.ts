import { z } from 'astro/zod';
import { type ActorType, insertActivity, listActivity } from '@/lib/activity/store';
import { withAdmin } from '@/lib/api/handler';
import { resolveContentDatabase } from '@/lib/content/database';
import { ApiError, jsonOk, readJsonBody } from '@/lib/http';

export const prerender = false;

const logRequestSchema = z.object({
  actorId: z.string().min(1).max(120),
  actorType: z.enum(['user', 'agent']).default('agent'),
  actorLabel: z.string().min(1).max(120),
  action: z.string().min(1).max(80),
  targetType: z.string().max(40).optional(),
  targetId: z.string().max(200).optional(),
  summary: z.string().min(1).max(300),
});

function readActorType(value: string | null): ActorType | undefined {
  return value === 'user' || value === 'agent' ? value : undefined;
}

export const GET = withAdmin(async ({ url }, requestId) => {
  const database = await resolveContentDatabase();
  if (!database) {
    throw new ApiError(503, 'DATABASE_UNAVAILABLE', 'The content database is unavailable.');
  }

  const limitParam = Number.parseInt(url.searchParams.get('limit') ?? '50', 10);

  const activity = await listActivity(database, {
    actorId: url.searchParams.get('actor') ?? undefined,
    actorType: readActorType(url.searchParams.get('type')),
    limit: Number.isFinite(limitParam) ? limitParam : 50,
  });

  return jsonOk({ activity }, requestId);
});

export const POST = withAdmin(async ({ request }, requestId) => {
  const database = await resolveContentDatabase();
  if (!database) {
    throw new ApiError(503, 'DATABASE_UNAVAILABLE', 'The content database is unavailable.');
  }

  const payload = logRequestSchema.parse(await readJsonBody(request, 20_000));

  await insertActivity(database, {
    actorId: payload.actorId,
    actorType: payload.actorType,
    actorLabel: payload.actorLabel,
    action: payload.action,
    targetType: payload.targetType ?? null,
    targetId: payload.targetId ?? null,
    summary: payload.summary,
  });

  return jsonOk({ logged: true }, requestId, 201);
});
