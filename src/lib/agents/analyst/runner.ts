import { ApiError } from '../../errors';
import { listRecentPublishedTitles } from '../review';
import { listTopics } from '../topics';
import { readAnalystConfig } from './config';
import {
  countOpenFindingsByRule,
  type FindingPersistResult,
  persistFindings,
  recordSourceStatuses,
} from './findings';
import type { AnalystCandidate } from './rules';
import { runAnalystRules } from './rules';
import type { AnalystData, AnalystSourceStatus } from './sources';
import { buildDataQuality, loadAnalystSources, selectFatalSourceFailures } from './sources';
import type { AnalystWindow } from './window';
import { resolveAnalystWindow } from './window';

export interface AnalystRunReport {
  summary: string;
  output: string;
  window: AnalystWindow;
  statuses: AnalystSourceStatus[];
  persisted: FindingPersistResult;
}

export function summarizeAnalystRun(input: {
  window: AnalystWindow;
  data: AnalystData;
  statuses: readonly AnalystSourceStatus[];
  persisted: FindingPersistResult;
}): string {
  const unavailable = input.statuses
    .filter((status) => status.status !== 'ok')
    .map((status) => status.source);
  const coverage = unavailable.length > 0 ? `; sources unavailable: ${unavailable.join(', ')}` : '';

  return `Reviewed ${input.data.totals.publishedPosts} published posts, ${input.data.totals.views} views, and ${input.data.totals.clicks} clicks for ${input.window.start} to ${input.window.end}: ${input.persisted.inserted} new, ${input.persisted.refreshed} refreshed, ${input.persisted.preserved} preserved, ${input.persisted.expired} expired, ${input.persisted.resolved} auto-resolved${coverage}`;
}

export function renderAnalystFindings(candidates: readonly AnalystCandidate[]): string {
  if (candidates.length === 0) {
    return 'No findings for this window.';
  }

  return candidates
    .map(
      (candidate) =>
        `[${candidate.ruleId}] ${candidate.title} (score ${candidate.score}, effort ${candidate.actionEffort})`,
    )
    .join('\n');
}

export async function runPerformanceAnalyst(
  db: D1Database,
  input: { agentId: string; runId: string; now?: Date; signal?: AbortSignal },
): Promise<AnalystRunReport> {
  const now = input.now ?? new Date();
  const window = resolveAnalystWindow(now);
  const config = await readAnalystConfig(db);
  const [sources, openNewTopicFindings, existingTopics, publishedTitles] = await Promise.all([
    loadAnalystSources(db, window, { signal: input.signal }),
    countOpenFindingsByRule(db, 'new_topic'),
    listTopics(db, { limit: 200 }),
    listRecentPublishedTitles(db, 200),
  ]);
  const { data, statuses } = sources;

  await recordSourceStatuses(db, input.runId, statuses, now);

  const failures = selectFatalSourceFailures(statuses);

  if (failures.length > 0) {
    throw new ApiError(
      500,
      'ANALYST_SOURCE_FAILED',
      `The analyst could not read ${failures.map((status) => status.source).join(', ')}.`,
      { sources: failures.map((status) => status.source) },
    );
  }

  const rules = runAnalystRules({
    data,
    config,
    window,
    dataQuality: buildDataQuality(statuses),
    knownTitles: [...existingTopics.map((topic) => topic.title), ...publishedTitles],
    openNewTopicFindings,
  });

  const persisted = await persistFindings(db, {
    runId: input.runId,
    agentId: input.agentId,
    window,
    candidates: rules.candidates,
    presentKeys: rules.presentKeys,
    now,
  });

  return {
    summary: summarizeAnalystRun({ window, data, statuses, persisted }),
    output: renderAnalystFindings(rules.candidates),
    window,
    statuses,
    persisted,
  };
}
