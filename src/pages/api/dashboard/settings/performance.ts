import { z } from 'astro/zod';
import { recordActivity, toUserActor } from '@/lib/activity/record';
import { readAnalystConfig } from '@/lib/agents/analyst/config';
import {
  describeAnalystCredentials,
  parseServiceAccount,
  saveGa4Credentials,
  saveGscCredentials,
  validateGa4PropertyId,
  validateGscProperty,
} from '@/lib/agents/analyst/credentials';
import { listLatestAnalystSourceStatuses } from '@/lib/agents/analyst/findings';
import { ANALYST_SOURCES } from '@/lib/agents/analyst/sources';
import { findAgent, SYSTEM_ANALYST_AGENT_ID } from '@/lib/agents/store';
import { withAdmin } from '@/lib/api/handler';
import { requireContentDatabase } from '@/lib/content/database';
import { jsonOk, readJsonBody } from '@/lib/http';

export const prerender = false;

const UNCHECKED_SOURCE_DETAIL =
  'The analyst has not read this source yet, so there is nothing to report for it.';
const UNCHECKED_SOURCE_REMEDIATION =
  'Run the Performance Analyst once so every source records what it returned.';

const gscCredentialsSchema = z
  .object({
    serviceAccount: z.string().max(20_000).optional(),
    property: z.string().max(500).optional(),
  })
  .strict();

const ga4CredentialsSchema = z
  .object({
    serviceAccount: z.string().max(20_000).optional(),
    propertyId: z.string().max(120).optional(),
  })
  .strict();

const performanceSettingsSchema = z
  .object({
    gsc: gscCredentialsSchema.optional(),
    ga4: ga4CredentialsSchema.optional(),
  })
  .strict();

export const GET = withAdmin(async (_context, requestId) => {
  const database = await requireContentDatabase();
  const [credentials, config, statusRows, agent] = await Promise.all([
    describeAnalystCredentials(database),
    readAnalystConfig(database),
    listLatestAnalystSourceStatuses(database),
    findAgent(database, SYSTEM_ANALYST_AGENT_ID),
  ]);
  const latestBySource = new Map(statusRows.map((row) => [row.source, row]));
  const sources = ANALYST_SOURCES.map(
    (source) =>
      latestBySource.get(source) ?? {
        source,
        status: 'unknown',
        detail: UNCHECKED_SOURCE_DETAIL,
        remediation: UNCHECKED_SOURCE_REMEDIATION,
        rowCount: 0,
        checkedAt: null,
      },
  );

  return jsonOk(
    {
      credentials,
      config,
      sources,
      schedule: agent
        ? {
            mode: agent.scheduleMode,
            enabled: agent.enabled,
            lastRunAt: agent.lastRunAt,
            nextRunAt: agent.nextRunAt,
          }
        : null,
    },
    requestId,
  );
});

export const PUT = withAdmin(async ({ request }, requestId, user) => {
  const database = await requireContentDatabase();
  const payload = performanceSettingsSchema.parse(await readJsonBody(request, 50_000));

  if (payload.gsc?.serviceAccount) {
    parseServiceAccount(payload.gsc.serviceAccount);
  }
  if (payload.gsc?.property) {
    validateGscProperty(payload.gsc.property);
  }
  if (payload.ga4?.serviceAccount) {
    parseServiceAccount(payload.ga4.serviceAccount);
  }
  if (payload.ga4?.propertyId) {
    validateGa4PropertyId(payload.ga4.propertyId);
  }

  const changed: string[] = [];

  if (
    payload.gsc &&
    (payload.gsc.serviceAccount !== undefined || payload.gsc.property !== undefined)
  ) {
    await saveGscCredentials(database, payload.gsc);
    changed.push('Search Console');
  }

  if (
    payload.ga4 &&
    (payload.ga4.serviceAccount !== undefined || payload.ga4.propertyId !== undefined)
  ) {
    await saveGa4Credentials(database, payload.ga4);
    changed.push('GA4');
  }

  const credentials = await describeAnalystCredentials(database);

  for (const source of changed) {
    await recordActivity({
      ...toUserActor(user),
      action: 'settings.performance_credentials_updated',
      summary: `Updated the ${source} credentials for the performance analyst`,
    });
  }

  return jsonOk({ credentials, changed }, requestId);
});
