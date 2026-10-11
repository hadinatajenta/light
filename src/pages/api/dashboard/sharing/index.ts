import { withAdmin } from '@/lib/api/handler';
import { requireContentDatabase } from '@/lib/content/database';
import { jsonOk } from '@/lib/http';
import { listShareChannels } from '@/lib/sharing/channels';
import { listShareJobs } from '@/lib/sharing/outbox';
import { isSharePaused } from '@/lib/sharing/reconciler';

export const prerender = false;

const DEFAULT_JOB_LIMIT = 100;
const MAX_JOB_LIMIT = 500;

function parseJobLimit(raw: string | null): number {
  const parsed = raw === null ? Number.NaN : Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_JOB_LIMIT;
  }

  return Math.min(parsed, MAX_JOB_LIMIT);
}

export const GET = withAdmin(async ({ url }, requestId) => {
  const database = await requireContentDatabase();
  const limit = parseJobLimit(url.searchParams.get('limit'));

  const [channels, jobs, paused] = await Promise.all([
    listShareChannels(database),
    listShareJobs(database, limit),
    isSharePaused(database),
  ]);

  return jsonOk({ channels, jobs, paused }, requestId);
});
