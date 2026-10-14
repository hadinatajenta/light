import { testGa4Credentials, testGscCredentials } from '@/lib/agents/analyst/sources';
import { withAdmin } from '@/lib/api/handler';
import { requireContentDatabase } from '@/lib/content/database';
import { jsonOk } from '@/lib/http';

export const prerender = false;

export const POST = withAdmin(async (_context, requestId) => {
  const database = await requireContentDatabase();
  const [gsc, ga4] = await Promise.all([
    testGscCredentials(database),
    testGa4Credentials(database),
  ]);

  return jsonOk({ gsc, ga4 }, requestId);
});
