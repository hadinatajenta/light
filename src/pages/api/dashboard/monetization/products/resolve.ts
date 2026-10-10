import { z } from 'astro/zod';
import { getProgram } from '@/lib/affiliate/store';
import { resolveAffiliateTarget } from '@/lib/affiliate/targets';
import { withAdmin } from '@/lib/api/handler';
import { requireContentDatabase } from '@/lib/content/database';
import { jsonOk, readJsonBody } from '@/lib/http';

export const prerender = false;

const resolveRequestSchema = z.object({
  programId: z.string().min(1).max(60),
  target: z.string().min(1).max(800),
});

export const POST = withAdmin(async ({ request }, requestId) => {
  const database = await requireContentDatabase();
  const payload = resolveRequestSchema.parse(await readJsonBody(request, 5_000));
  const program = await getProgram(database, payload.programId);
  const resolved = resolveAffiliateTarget(payload.target, program.network === 'amazon');

  return jsonOk(resolved, requestId);
});
