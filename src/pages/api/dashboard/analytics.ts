import { loadAnalyticsSnapshot, loadTopicHighlights } from '@/lib/analytics/store';
import { withAdmin } from '@/lib/api/handler';
import { requireContentDatabase } from '@/lib/content/database';
import { jsonOk } from '@/lib/http';

export const prerender = false;

export const GET = withAdmin(async (_context, requestId) => {
  const database = await requireContentDatabase();
  const [snapshot, topics] = await Promise.all([
    loadAnalyticsSnapshot(database),
    loadTopicHighlights(database),
  ]);

  return jsonOk({ ...snapshot, topics }, requestId);
});
