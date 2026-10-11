import { z } from 'astro/zod';
import {
  type ActivityQuery,
  type ActorType,
  countActivity,
  insertActivity,
  listActivity,
  listActivityActions,
} from '@/lib/activity/store';
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

function readDateFilter(value: string | null, field: 'since' | 'until'): string | undefined {
  if (!value) {
    return undefined;
  }

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    throw new ApiError(400, 'INVALID_DATE', `The ${field} filter must be a valid date.`);
  }

  return new Date(timestamp).toISOString();
}

export const GET = withAdmin(async ({ url }, requestId) => {
  const database = await resolveContentDatabase();
  if (!database) {
    throw new ApiError(503, 'DATABASE_UNAVAILABLE', 'The content database is unavailable.');
  }

  const limitParam = Number.parseInt(url.searchParams.get('limit') ?? '', 10);
  const offsetParam = Number.parseInt(url.searchParams.get('offset') ?? '', 10);

  const query: ActivityQuery = {
    actorId: url.searchParams.get('actor') ?? undefined,
    actorType: readActorType(url.searchParams.get('type')),
    action: url.searchParams.get('action') ?? undefined,
    targetType: url.searchParams.get('targetType') ?? undefined,
    targetId: url.searchParams.get('targetId') ?? undefined,
    since: readDateFilter(url.searchParams.get('since'), 'since'),
    until: readDateFilter(url.searchParams.get('until'), 'until'),
    search: url.searchParams.get('q') ?? undefined,
    limit: Number.isFinite(limitParam) ? limitParam : undefined,
    offset: Number.isFinite(offsetParam) ? offsetParam : undefined,
  };

  const [activity, total, actions] = await Promise.all([
    listActivity(database, query),
    countActivity(database, query),
    listActivityActions(database),
  ]);

  return jsonOk({ activity, total, actions }, requestId);
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
