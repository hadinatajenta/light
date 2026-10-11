import { insertActivity } from '../activity/store';
import { todayKey } from '../agents/budget';
import { blueskyAdapter } from './adapters/bluesky';
import { discordAdapter } from './adapters/discord';
import { mastodonAdapter } from './adapters/mastodon';
import { pinterestAdapter } from './adapters/pinterest';
import { telegramAdapter } from './adapters/telegram';
import {
  getShareChannel,
  readChannelConfig,
  setChannelNeedsAttention,
  setChannelPausedUntil,
  touchChannelSuccess,
} from './channels';
import {
  claimShareJobs,
  markShareFailed,
  markShareSent,
  markShareSkipped,
  recordShareFailure,
  recordShareRateLimit,
  rescheduleShareJob,
  returnUnprocessedShares,
} from './outbox';
import { buildBaseUrl, buildShareUrl, renderShareMessage } from './templates';
import {
  type AdapterResult,
  SHARE_MAX_FAILURES,
  SHARE_MAX_RETRY_AFTER_MS,
  type ShareAdapter,
  type ShareChannel,
  type ShareJob,
  type SharePostContent,
  type ShareProvider,
} from './types';

const BACKOFF_STEPS_MS = [60_000, 300_000, 1_800_000, 7_200_000];
const DEFAULT_RATE_LIMIT_MS = 60_000;
const HTTP_TIMEOUT_CAP_MS = 10_000;
const ERROR_MAX_LENGTH = 500;

const ADAPTERS: Record<ShareProvider, ShareAdapter> = {
  telegram: telegramAdapter,
  bluesky: blueskyAdapter,
  discord: discordAdapter,
  mastodon: mastodonAdapter,
  pinterest: pinterestAdapter,
};

const SHARER_ACTOR = {
  actorId: 'sharer',
  actorType: 'agent',
  actorLabel: 'Sharing',
} as const;

interface PostRow {
  id: string;
  title: string;
  description: string;
  body: string;
  cover_url: string | null;
  affiliate: number;
  status: string;
}

export type ShareOutcome = 'sent' | 'failed' | 'deferred' | 'skipped';

export type ShareOutcomeAction =
  | 'sent'
  | 'channel_config'
  | 'failed'
  | 'rate_limited'
  | 'transient';

export interface ShareOutcomePlan {
  action: ShareOutcomeAction;
  providerPostId?: string;
  retryAfterMs?: number;
  channelLevelRateLimit?: boolean;
  error?: string;
}

export function backoffMsForFailures(failures: number): number | null {
  if (failures >= SHARE_MAX_FAILURES) {
    return null;
  }

  const index = Math.max(failures, 1) - 1;
  return BACKOFF_STEPS_MS[Math.min(index, BACKOFF_STEPS_MS.length - 1)];
}

export function clampRetryAfterMs(retryAfterMs: number | undefined): number {
  if (typeof retryAfterMs !== 'number' || !Number.isFinite(retryAfterMs) || retryAfterMs <= 0) {
    return DEFAULT_RATE_LIMIT_MS;
  }

  return Math.min(retryAfterMs, SHARE_MAX_RETRY_AFTER_MS);
}

export function resolveOutcomePlan(result: AdapterResult): ShareOutcomePlan {
  switch (result.outcome) {
    case 'success':
      return { action: 'sent', providerPostId: result.providerPostId };
    case 'channel_config':
      return { action: 'channel_config', error: result.error };
    case 'invalid_payload':
      return { action: 'failed', error: result.error };
    case 'rate_limited':
      return {
        action: 'rate_limited',
        retryAfterMs: result.retryAfterMs,
        channelLevelRateLimit: result.channelLevelRateLimit,
        error: result.error,
      };
    default:
      return { action: 'transient', error: result.error };
  }
}

export function redactShareError(message: string | undefined, secrets: string[]): string {
  let output = message ?? 'Sharing failed.';

  for (const secret of secrets) {
    if (secret.length >= 6) {
      output = output.split(secret).join('[redacted]');
    }
  }

  output = output.replace(/bot\d+:[A-Za-z0-9_-]+/g, 'bot[redacted]');
  return output.slice(0, ERROR_MAX_LENGTH);
}

export interface RunShareSenderOptions {
  now: Date;
  origin: string;
  budgetMs: number;
  maxJobs: number;
  perChannelLimit: number;
  jobDeadlineMs: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  jitterMs?: { min: number; max: number };
  clock?: () => number;
}

export interface RunShareSenderResult {
  processed: number;
  remaining: number;
  sent: number;
  failed: number;
  deferred: number;
  skipped: number;
}

interface ProcessContext {
  now: Date;
  origin: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomBetween(min: number, max: number): number {
  if (max <= min) {
    return min;
  }

  return min + Math.floor(Math.random() * (max - min + 1));
}

function toPostContent(row: PostRow): SharePostContent {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    body: row.body,
    coverUrl: row.cover_url,
    affiliate: row.affiliate === 1,
  };
}

async function loadPublishedPost(db: D1Database, id: string): Promise<SharePostContent | null> {
  const row = await db
    .prepare(
      'SELECT id, title, description, body, cover_url, affiliate, status FROM posts WHERE id = ?',
    )
    .bind(id)
    .first<PostRow>();

  if (!row) {
    return null;
  }

  if (row.status !== 'published') {
    return null;
  }

  return toPostContent(row);
}

async function recordShareUsage(db: D1Database, channelId: string, now: Date): Promise<void> {
  await db
    .prepare(
      `INSERT INTO usage_counters (day, kind, count, tokens_in, tokens_out, updated_at)
       VALUES (?, ?, 1, 0, 0, ?)
       ON CONFLICT(day, kind) DO UPDATE SET count = count + excluded.count, updated_at = excluded.updated_at`,
    )
    .bind(todayKey(now), `share:${channelId}`, now.toISOString())
    .run();
}

async function recordShareActivity(
  db: D1Database,
  action: string,
  postId: string,
  summary: string,
): Promise<void> {
  try {
    await insertActivity(db, {
      ...SHARER_ACTOR,
      action,
      targetType: 'post',
      targetId: postId,
      summary,
    });
  } catch (error) {
    console.error('Failed to record share activity', action, error);
  }
}

async function applyAdapterResult(
  db: D1Database,
  job: ShareJob,
  channel: ShareChannel,
  post: SharePostContent,
  result: AdapterResult,
  config: Record<string, string>,
  context: ProcessContext,
): Promise<ShareOutcome> {
  const plan = resolveOutcomePlan(result);
  const lockedAt = job.lockedAt ?? context.now.toISOString();
  const secrets = Object.values(config);
  const error = plan.error ? redactShareError(plan.error, secrets) : undefined;

  if (plan.action === 'sent') {
    const applied = await markShareSent(db, job.id, {
      lockedAt,
      providerPostId: plan.providerPostId ?? null,
      sharedUrl: buildBaseUrl(post, context.origin),
    });

    if (!applied) {
      console.warn('Duplicate share write for outbox row', job.id);
      return 'sent';
    }

    await recordShareUsage(db, channel.id, context.now);
    await touchChannelSuccess(db, channel.id);
    await recordShareActivity(
      db,
      'share.sent',
      post.id,
      `Shared "${post.title}" to ${channel.label}`,
    );
    return 'sent';
  }

  if (plan.action === 'channel_config') {
    await rescheduleShareJob(db, job.id, {
      lockedAt,
      nextAttemptAt: context.now.toISOString(),
      error: error ?? 'The channel needs attention.',
    });
    await setChannelNeedsAttention(db, channel.id, true, error);
    return 'deferred';
  }

  if (plan.action === 'failed') {
    const applied = await markShareFailed(db, job.id, {
      lockedAt,
      error: error ?? 'The share payload was rejected.',
    });
    if (applied) {
      await recordShareActivity(db, 'share.failed', post.id, `Failed to share "${post.title}"`);
    }
    return 'failed';
  }

  if (plan.action === 'rate_limited') {
    const delay = clampRetryAfterMs(plan.retryAfterMs);
    const nextAttemptAt = new Date(context.now.getTime() + delay).toISOString();
    await recordShareRateLimit(db, job.id, {
      lockedAt,
      nextAttemptAt,
      error: error ?? 'Rate limited.',
    });

    if (plan.channelLevelRateLimit) {
      await setChannelPausedUntil(db, channel.id, nextAttemptAt);
    }

    return 'deferred';
  }

  const failures = job.failures + 1;
  const backoff = backoffMsForFailures(failures);
  const nextAttemptAt =
    backoff === null ? null : new Date(context.now.getTime() + backoff).toISOString();

  await recordShareFailure(db, job.id, {
    lockedAt,
    failures,
    nextAttemptAt,
    error: error ?? 'Transient sharing failure.',
  });

  if (nextAttemptAt === null) {
    await recordShareActivity(db, 'share.failed', post.id, `Failed to share "${post.title}"`);
    return 'failed';
  }

  return 'deferred';
}

async function processShareJob(
  db: D1Database,
  job: ShareJob,
  context: ProcessContext,
): Promise<ShareOutcome> {
  const lockedAt = job.lockedAt ?? context.now.toISOString();

  let channel: ShareChannel;
  try {
    channel = await getShareChannel(db, job.channelId);
  } catch {
    await markShareSkipped(db, job.id, { lockedAt });
    return 'skipped';
  }

  const post = await loadPublishedPost(db, job.postId);
  if (!post) {
    await markShareSkipped(db, job.id, { lockedAt });
    return 'skipped';
  }

  const isPaused = channel.pausedUntil !== null && channel.pausedUntil > context.now.toISOString();
  if (!channel.enabled || channel.needsAttention || isPaused) {
    await rescheduleShareJob(db, job.id, {
      lockedAt,
      nextAttemptAt: context.now.toISOString(),
    });
    return 'deferred';
  }

  const config = await readChannelConfig(db, channel);
  const adapter = ADAPTERS[channel.provider];
  const url = buildShareUrl(post, channel, context.origin);
  const message = renderShareMessage(channel, post, context.origin);

  const result = await adapter.send({
    channel,
    config,
    post,
    message,
    url,
    timeoutMs: context.timeoutMs,
    fetchImpl: context.fetchImpl,
  });

  return applyAdapterResult(db, job, channel, post, result, config, context);
}

export async function runShareSender(
  db: D1Database,
  options: RunShareSenderOptions,
): Promise<RunShareSenderResult> {
  const counters: RunShareSenderResult = {
    processed: 0,
    remaining: 0,
    sent: 0,
    failed: 0,
    deferred: 0,
    skipped: 0,
  };

  const nowIso = options.now.toISOString();
  const claimed = await claimShareJobs(db, {
    now: nowIso,
    limit: options.maxJobs,
    perChannelLimit: options.perChannelLimit,
  });

  if (claimed.length === 0) {
    return counters;
  }

  const runDeadline = options.now.getTime() + options.budgetMs;
  const clock = options.clock ?? Date.now;
  const sleep = options.sleep ?? defaultSleep;
  const jitter = options.jitterMs ?? { min: 1000, max: 2000 };
  const unprocessed: string[] = [];

  for (let index = 0; index < claimed.length; index += 1) {
    const job = claimed[index];
    const remainingBudget = runDeadline - clock();
    if (remainingBudget <= 0) {
      unprocessed.push(...claimed.slice(index).map((entry) => entry.id));
      break;
    }

    const remainingJobs = claimed.length - index;
    const perJobBudget = Math.floor(remainingBudget / remainingJobs);
    const deadline = Math.min(clock() + options.jobDeadlineMs, runDeadline, clock() + perJobBudget);
    const timeoutMs = Math.max(1000, Math.min(HTTP_TIMEOUT_CAP_MS, deadline - clock()));

    const outcome = await processShareJob(db, job, {
      now: options.now,
      origin: options.origin,
      timeoutMs,
      fetchImpl: options.fetchImpl,
    });

    counters.processed += 1;
    counters[outcome] += 1;

    if (index < claimed.length - 1) {
      const delay = randomBetween(jitter.min, jitter.max);
      if (delay > 0 && runDeadline - clock() > 0) {
        await sleep(delay);
      }
    }
  }

  if (unprocessed.length > 0) {
    await returnUnprocessedShares(db, unprocessed);
    counters.remaining = unprocessed.length;
  }

  return counters;
}
