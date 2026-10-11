import { z } from 'astro/zod';
import { recordActivity, toUserActor } from '@/lib/activity/record';
import { withAdmin } from '@/lib/api/handler';
import { requireContentDatabase } from '@/lib/content/database';
import { ApiError, jsonOk, readJsonBody } from '@/lib/http';
import { approveShareJob, getShareJob, retryShareJob } from '@/lib/sharing/outbox';

export const prerender = false;

const jobActionSchema = z.object({
  action: z.enum(['retry', 'approve']),
});

function requireId(params: Record<string, string | undefined>): string {
  const id = params.id;
  if (!id) {
    throw new ApiError(400, 'MISSING_ID', 'The sharing job id is required.');
  }

  return id;
}

export const POST = withAdmin(async ({ params, request }, requestId, user) => {
  const database = await requireContentDatabase();
  const id = requireId(params);
  const payload = jobActionSchema.parse(await readJsonBody(request, 5_000));

  const job = await getShareJob(database, id);
  if (!job) {
    throw new ApiError(404, 'SHARE_JOB_NOT_FOUND', 'That sharing job does not exist.');
  }

  if (payload.action === 'approve') {
    if (job.status !== 'awaiting_approval') {
      throw new ApiError(
        409,
        'SHARE_JOB_NOT_AWAITING_APPROVAL',
        'That sharing job is not awaiting approval.',
      );
    }

    await approveShareJob(database, id);
  } else {
    await retryShareJob(database, id);
  }

  const updated = await getShareJob(database, id);

  await recordActivity({
    ...toUserActor(user),
    action: payload.action === 'retry' ? 'share.job_retried' : 'share.job_approved',
    targetType: 'share_job',
    targetId: id,
    summary: `${payload.action === 'retry' ? 'Retried' : 'Approved'} sharing job "${id}"`,
  });

  return jsonOk({ job: updated }, requestId);
});
