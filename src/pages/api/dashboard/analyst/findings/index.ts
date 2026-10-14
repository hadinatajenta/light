import { z } from 'astro/zod';
import { ANALYST_FINDING_STATUSES } from '@/lib/agents/analyst/findings';
import { ANALYST_RULE_IDS } from '@/lib/agents/analyst/rules';
import { withAdmin } from '@/lib/api/handler';
import { requireContentDatabase } from '@/lib/content/database';
import {
  ANALYST_FINDING_PAGE_DEFAULT,
  ANALYST_FINDING_PAGE_MAX,
  loadAnalystFindingPage,
} from '@/lib/dashboard/analyst';
import { jsonOk } from '@/lib/http';

export const prerender = false;

const findingsQuerySchema = z.object({
  status: z.enum([...ANALYST_FINDING_STATUSES, 'all'] as const).default('all'),
  rule: z.enum(ANALYST_RULE_IDS).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(ANALYST_FINDING_PAGE_MAX)
    .default(ANALYST_FINDING_PAGE_DEFAULT),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
});

export const GET = withAdmin(async ({ url }, requestId) => {
  const database = await requireContentDatabase();
  const query = findingsQuerySchema.parse({
    status: url.searchParams.get('status') ?? undefined,
    rule: url.searchParams.get('rule') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined,
    offset: url.searchParams.get('offset') ?? undefined,
  });

  const page = await loadAnalystFindingPage(database, {
    status: query.status === 'all' ? undefined : query.status,
    rule: query.rule,
    limit: query.limit,
    offset: query.offset,
  });

  return jsonOk(page, requestId);
});
