import { ApiError } from '../errors';

export interface RateLimitRule {
  key: string;
  limit: number;
  windowMs: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

interface RateLimitRow {
  window_start: string;
  window_count: number;
}

export function windowStartFor(now: number, windowMs: number): string {
  return new Date(Math.floor(now / windowMs) * windowMs).toISOString();
}

export function decideRateLimit(
  windowStart: string,
  count: number,
  rule: RateLimitRule,
  now: number,
): RateLimitDecision {
  const currentWindowStart = windowStartFor(now, rule.windowMs);
  const consumed = windowStart === currentWindowStart ? count : 1;
  const allowed = consumed <= rule.limit;
  const remaining = Math.max(0, rule.limit - consumed);
  const retryAfterSeconds = allowed
    ? 0
    : Math.max(1, Math.ceil((Date.parse(currentWindowStart) + rule.windowMs - now) / 1000));

  return { allowed, remaining, retryAfterSeconds };
}

export async function consumeRateLimit(
  db: D1Database,
  rule: RateLimitRule,
  now: number = Date.now(),
): Promise<RateLimitDecision> {
  const currentWindowStart = windowStartFor(now, rule.windowMs);

  const row = await db
    .prepare(
      `INSERT INTO rate_limits (key, window_start, window_count)
       VALUES (?, ?, 1)
       ON CONFLICT(key) DO UPDATE SET
         window_count = CASE
           WHEN rate_limits.window_start = excluded.window_start THEN rate_limits.window_count + 1
           ELSE 1
         END,
         window_start = excluded.window_start
       RETURNING window_count, window_start`,
    )
    .bind(rule.key, currentWindowStart)
    .first<RateLimitRow>();

  if (!row) {
    return decideRateLimit(currentWindowStart, 1, rule, now);
  }

  return decideRateLimit(row.window_start, row.window_count, rule, now);
}

export async function enforceRateLimit(
  db: D1Database,
  rule: RateLimitRule,
  now: number = Date.now(),
): Promise<void> {
  const decision = await consumeRateLimit(db, rule, now);

  if (!decision.allowed) {
    throw new ApiError(429, 'RATE_LIMITED', 'Too many requests. Try again shortly.');
  }
}
