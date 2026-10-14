import { z } from 'astro/zod';
import { recordActivity, toUserActor } from '@/lib/activity/record';
import { AFFILIATE_NETWORKS } from '@/lib/affiliate/store';
import { importAffiliateReport } from '@/lib/agents/analyst/report';
import { SYSTEM_ANALYST_AGENT_ID } from '@/lib/agents/store';
import { withAdmin } from '@/lib/api/handler';
import { requireContentDatabase } from '@/lib/content/database';
import { jsonOk, readJsonBody } from '@/lib/http';

export const prerender = false;

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const affiliateReportSchema = z
  .object({
    network: z.enum(AFFILIATE_NETWORKS),
    periodStart: z.string().regex(DAY_PATTERN, 'Use YYYY-MM-DD.'),
    periodEnd: z.string().regex(DAY_PATTERN, 'Use YYYY-MM-DD.'),
    sourceFilename: z.string().max(200).optional(),
    content: z.string().min(1).max(1_500_000),
  })
  .strict();

export const POST = withAdmin(async ({ request }, requestId, user) => {
  const database = await requireContentDatabase();
  const payload = affiliateReportSchema.parse(await readJsonBody(request, 2_000_000));
  const result = await importAffiliateReport(database, {
    network: payload.network,
    periodStart: payload.periodStart,
    periodEnd: payload.periodEnd,
    sourceFilename: payload.sourceFilename ?? null,
    importedBy: user.email,
    content: payload.content,
  });

  await recordActivity({
    ...toUserActor(user),
    action: 'analyst.affiliate_report_imported',
    targetType: 'agent',
    targetId: SYSTEM_ANALYST_AGENT_ID,
    summary: `Imported ${result.imported} line(s) for ${payload.network} ${payload.periodStart} to ${payload.periodEnd} (${result.unmatched} unmatched, ${result.skipped} skipped)`,
  });

  return jsonOk(
    {
      imported: result.imported,
      unmatched: result.unmatched,
      skipped: result.skipped,
    },
    requestId,
  );
});
