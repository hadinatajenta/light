import { scanContentAudit } from '@/lib/audit/store';
import { withAdmin } from '@/lib/api/handler';
import { requireContentDatabase } from '@/lib/content/database';
import { jsonOk } from '@/lib/http';

export const prerender = false;

export const GET = withAdmin(async (_context, requestId) => {
  const database = await requireContentDatabase();
  const report = await scanContentAudit(database);

  return jsonOk(report, requestId);
});
