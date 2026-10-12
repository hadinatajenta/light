import { loadViewSnapshot, VIEW_RANGE_DAYS, type ViewRangeDays } from '@/lib/analytics/views';
import { withAdmin } from '@/lib/api/handler';
import { requireContentDatabase } from '@/lib/content/database';
import { jsonOk } from '@/lib/http';

export const prerender = false;

function readRange(value: string | null): ViewRangeDays {
  const parsed = Number.parseInt(value ?? '', 10);

  return (VIEW_RANGE_DAYS as readonly number[]).includes(parsed) ? (parsed as ViewRangeDays) : 30;
}

export const GET = withAdmin(async ({ url }, requestId) => {
  const database = await requireContentDatabase();
  const snapshot = await loadViewSnapshot(database, {
    days: readRange(url.searchParams.get('days')),
  });

  return jsonOk(snapshot, requestId);
});
