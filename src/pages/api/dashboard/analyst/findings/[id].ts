import { z } from 'astro/zod';
import { recordActivity, toUserActor } from '@/lib/activity/record';
import { withAdmin } from '@/lib/api/handler';
import { requireContentDatabase } from '@/lib/content/database';
import {
  ANALYST_FINDING_NOTE_MAX_LENGTH,
  applyAnalystFindingStatus,
} from '@/lib/dashboard/analyst';
import { ApiError, jsonOk, readJsonBody } from '@/lib/http';

export const prerender = false;

const findingUpdateSchema = z.object({
  status: z.enum(['resolved', 'dismissed', 'open']),
  note: z.string().trim().max(ANALYST_FINDING_NOTE_MAX_LENGTH).optional(),
});

const FINDING_ACTIVITY_ACTIONS: Record<string, string> = {
  resolved: 'analyst.finding_resolved',
  dismissed: 'analyst.finding_dismissed',
  open: 'analyst.finding_reopened',
};

const FINDING_ACTIVITY_VERBS: Record<string, string> = {
  resolved: 'Resolved',
  dismissed: 'Dismissed',
  open: 'Reopened',
};

export const PATCH = withAdmin(async ({ params, request }, requestId, user) => {
  const database = await requireContentDatabase();
  const id = params.id;

  if (!id) {
    throw new ApiError(400, 'MISSING_ID', 'The finding id is required.');
  }

  const payload = findingUpdateSchema.parse(await readJsonBody(request, 10_000));
  const finding = await applyAnalystFindingStatus(
    database,
    id,
    payload.status,
    user.email,
    payload.note ?? null,
  );

  await recordActivity({
    ...toUserActor(user),
    action: FINDING_ACTIVITY_ACTIONS[payload.status],
    targetType: 'analyst_finding',
    targetId: finding.id,
    summary: `${FINDING_ACTIVITY_VERBS[payload.status]} "${finding.title}"`,
  });

  return jsonOk({ finding }, requestId);
});
