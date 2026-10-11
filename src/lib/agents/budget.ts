import { recordActivity } from '../activity/record';
import { getSetting, setSetting } from '../settings/store';

export const BUDGET_PAUSED_SETTING = 'budget_paused';
export const BUDGET_DAILY_SEARCHES_SETTING = 'budget_daily_searches';
export const BUDGET_MONTHLY_SEARCHES_SETTING = 'budget_monthly_searches';
export const BUDGET_DAILY_TOKENS_SETTING = 'budget_daily_tokens';
export const BUDGET_DAILY_COVERS_SETTING = 'budget_daily_covers';
export const BUDGET_FREE_CREDITS_SETTING = 'budget_free_monthly_credits';
export const BUDGET_CREDIT_PRICE_SETTING = 'budget_credit_price_usd';
export const BUDGET_WARNING_MONTH_SETTING = 'budget_warning_month';

export const DEFAULT_DAILY_SEARCHES = 40;
export const DEFAULT_MONTHLY_SEARCHES = 1500;
export const DEFAULT_DAILY_TOKENS = 2_000_000;
export const DEFAULT_DAILY_COVERS = 20;
export const DEFAULT_FREE_MONTHLY_CREDITS = 1500;
export const DEFAULT_CREDIT_PRICE_USD = 0.008;
export const BUDGET_WARNING_RATIO = 0.8;

export interface BudgetLimits {
  paused: boolean;
  dailySearches: number;
  monthlySearches: number;
  dailyTokens: number;
  dailyCovers: number;
  freeCredits: number;
  creditPriceUsd: number;
}

export interface BudgetState {
  paused: boolean;
  dailySearches: number;
  monthlySearches: number;
  dailyTokens: number;
  dailyCovers: number;
  searchUsedToday: number;
  searchUsedThisMonth: number;
  tokensUsedToday: number;
  coversUsedToday: number;
  searchesRemaining: number;
  tokensRemaining: number;
  coversRemaining: number;
  searchesExhausted: boolean;
  tokensExhausted: boolean;
  coversExhausted: boolean;
  freeCredits: number;
  creditPriceUsd: number;
  freeCreditsRemaining: number;
  paidCreditsUsed: number;
  estimatedCostUsd: number;
  paidMode: boolean;
  warning: boolean;
}

interface CounterRow {
  count: number;
  tokens_in: number;
  tokens_out: number;
}

export function todayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function monthPrefix(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7);
}

export function readLimit(value: string | null, fallback: number): number {
  const parsed = value ? Number.parseInt(value, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function readRate(value: string | null, fallback: number): number {
  const parsed = value ? Number.parseFloat(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function buildBudgetState(input: {
  paused: boolean;
  dailySearches: number;
  monthlySearches: number;
  dailyTokens: number;
  dailyCovers: number;
  searchUsedToday: number;
  searchUsedThisMonth: number;
  tokensUsedToday: number;
  coversUsedToday: number;
  freeCredits: number;
  creditPriceUsd: number;
}): BudgetState {
  const dailySearchRemaining = Math.max(input.dailySearches - input.searchUsedToday, 0);
  const monthlySearchRemaining = Math.max(input.monthlySearches - input.searchUsedThisMonth, 0);
  const searchesRemaining = Math.min(dailySearchRemaining, monthlySearchRemaining);
  const tokensRemaining = Math.max(input.dailyTokens - input.tokensUsedToday, 0);
  const coversRemaining = Math.max(input.dailyCovers - input.coversUsedToday, 0);
  const freeCreditsRemaining = Math.max(input.freeCredits - input.searchUsedThisMonth, 0);
  const paidCreditsUsed = Math.max(input.searchUsedThisMonth - input.freeCredits, 0);
  const estimatedCostUsd = paidCreditsUsed * input.creditPriceUsd;
  const paidMode = paidCreditsUsed > 0;
  const warning =
    input.freeCredits > 0 &&
    !paidMode &&
    input.searchUsedThisMonth >= input.freeCredits * BUDGET_WARNING_RATIO;

  return {
    paused: input.paused,
    dailySearches: input.dailySearches,
    monthlySearches: input.monthlySearches,
    dailyTokens: input.dailyTokens,
    dailyCovers: input.dailyCovers,
    searchUsedToday: input.searchUsedToday,
    searchUsedThisMonth: input.searchUsedThisMonth,
    tokensUsedToday: input.tokensUsedToday,
    coversUsedToday: input.coversUsedToday,
    searchesRemaining,
    tokensRemaining,
    coversRemaining,
    searchesExhausted: searchesRemaining <= 0,
    tokensExhausted: tokensRemaining <= 0,
    coversExhausted: coversRemaining <= 0,
    freeCredits: input.freeCredits,
    creditPriceUsd: input.creditPriceUsd,
    freeCreditsRemaining,
    paidCreditsUsed,
    estimatedCostUsd,
    paidMode,
    warning,
  };
}

export async function readBudgetLimits(db: D1Database): Promise<BudgetLimits> {
  const [
    paused,
    dailySearches,
    monthlySearches,
    dailyTokens,
    dailyCovers,
    freeCredits,
    creditPriceUsd,
  ] = await Promise.all([
    getSetting(db, BUDGET_PAUSED_SETTING),
    getSetting(db, BUDGET_DAILY_SEARCHES_SETTING),
    getSetting(db, BUDGET_MONTHLY_SEARCHES_SETTING),
    getSetting(db, BUDGET_DAILY_TOKENS_SETTING),
    getSetting(db, BUDGET_DAILY_COVERS_SETTING),
    getSetting(db, BUDGET_FREE_CREDITS_SETTING),
    getSetting(db, BUDGET_CREDIT_PRICE_SETTING),
  ]);

  return {
    paused: paused === 'true',
    dailySearches: readLimit(dailySearches, DEFAULT_DAILY_SEARCHES),
    monthlySearches: readLimit(monthlySearches, DEFAULT_MONTHLY_SEARCHES),
    dailyTokens: readLimit(dailyTokens, DEFAULT_DAILY_TOKENS),
    dailyCovers: readLimit(dailyCovers, DEFAULT_DAILY_COVERS),
    freeCredits: readLimit(freeCredits, DEFAULT_FREE_MONTHLY_CREDITS),
    creditPriceUsd: readRate(creditPriceUsd, DEFAULT_CREDIT_PRICE_USD),
  };
}

export async function saveBudgetLimits(
  db: D1Database,
  limits: Partial<BudgetLimits>,
): Promise<void> {
  if (typeof limits.paused === 'boolean') {
    await setSetting(db, BUDGET_PAUSED_SETTING, limits.paused ? 'true' : 'false');
  }
  if (typeof limits.dailySearches === 'number') {
    await setSetting(db, BUDGET_DAILY_SEARCHES_SETTING, String(limits.dailySearches));
  }
  if (typeof limits.monthlySearches === 'number') {
    await setSetting(db, BUDGET_MONTHLY_SEARCHES_SETTING, String(limits.monthlySearches));
  }
  if (typeof limits.dailyTokens === 'number') {
    await setSetting(db, BUDGET_DAILY_TOKENS_SETTING, String(limits.dailyTokens));
  }
  if (typeof limits.dailyCovers === 'number') {
    await setSetting(db, BUDGET_DAILY_COVERS_SETTING, String(limits.dailyCovers));
  }
  if (typeof limits.freeCredits === 'number') {
    await setSetting(db, BUDGET_FREE_CREDITS_SETTING, String(limits.freeCredits));
  }
  if (typeof limits.creditPriceUsd === 'number') {
    await setSetting(db, BUDGET_CREDIT_PRICE_SETTING, String(limits.creditPriceUsd));
  }
}

async function readCounter(db: D1Database, day: string, kind: string): Promise<CounterRow | null> {
  return db
    .prepare('SELECT count, tokens_in, tokens_out FROM usage_counters WHERE day = ? AND kind = ?')
    .bind(day, kind)
    .first<CounterRow>();
}

async function sumCounter(db: D1Database, prefix: string, kind: string): Promise<number> {
  const row = await db
    .prepare(
      'SELECT COALESCE(SUM(count), 0) AS total FROM usage_counters WHERE kind = ? AND day LIKE ?',
    )
    .bind(kind, `${prefix}%`)
    .first<{ total: number }>();

  return row?.total ?? 0;
}

export async function readBudgetState(
  db: D1Database,
  now: Date = new Date(),
): Promise<BudgetState> {
  const day = todayKey(now);
  const prefix = monthPrefix(now);
  const [limits, search, model, cover, monthSearches] = await Promise.all([
    readBudgetLimits(db),
    readCounter(db, day, 'search'),
    readCounter(db, day, 'model'),
    readCounter(db, day, 'cover'),
    sumCounter(db, prefix, 'search'),
  ]);

  return buildBudgetState({
    paused: limits.paused,
    dailySearches: limits.dailySearches,
    monthlySearches: limits.monthlySearches,
    dailyTokens: limits.dailyTokens,
    dailyCovers: limits.dailyCovers,
    searchUsedToday: search?.count ?? 0,
    searchUsedThisMonth: monthSearches,
    tokensUsedToday: (model?.tokens_in ?? 0) + (model?.tokens_out ?? 0),
    coversUsedToday: cover?.count ?? 0,
    freeCredits: limits.freeCredits,
    creditPriceUsd: limits.creditPriceUsd,
  });
}

export async function maybeRecordBudgetWarning(
  db: D1Database,
  now: Date = new Date(),
): Promise<boolean> {
  const month = monthPrefix(now);
  const warnedMonth = await getSetting(db, BUDGET_WARNING_MONTH_SETTING);
  if (warnedMonth === month) {
    return false;
  }

  const state = await readBudgetState(db, now);
  if (!state.warning && !state.paidMode) {
    return false;
  }

  await setSetting(db, BUDGET_WARNING_MONTH_SETTING, month);
  await recordActivity({
    actorId: 'budget',
    actorType: 'agent',
    actorLabel: 'Budget',
    action: 'budget.warning',
    summary: `Search usage ${state.searchUsedThisMonth} of ${state.freeCredits} free credits this month`,
  });

  return true;
}

export async function recordSearchUsage(
  db: D1Database,
  count = 1,
  now: Date = new Date(),
): Promise<void> {
  if (count <= 0) {
    return;
  }

  await db
    .prepare(
      `INSERT INTO usage_counters (day, kind, count, tokens_in, tokens_out, updated_at)
       VALUES (?, 'search', ?, 0, 0, ?)
       ON CONFLICT(day, kind) DO UPDATE SET count = count + excluded.count, updated_at = excluded.updated_at`,
    )
    .bind(todayKey(now), count, now.toISOString())
    .run();
}

export async function recordCoverUsage(
  db: D1Database,
  count = 1,
  now: Date = new Date(),
): Promise<void> {
  if (count <= 0) {
    return;
  }

  await db
    .prepare(
      `INSERT INTO usage_counters (day, kind, count, tokens_in, tokens_out, updated_at)
       VALUES (?, 'cover', ?, 0, 0, ?)
       ON CONFLICT(day, kind) DO UPDATE SET count = count + excluded.count, updated_at = excluded.updated_at`,
    )
    .bind(todayKey(now), count, now.toISOString())
    .run();
}

export async function recordModelUsage(
  db: D1Database,
  tokensIn: number,
  tokensOut: number,
  now: Date = new Date(),
): Promise<void> {
  if (tokensIn <= 0 && tokensOut <= 0) {
    return;
  }

  await db
    .prepare(
      `INSERT INTO usage_counters (day, kind, count, tokens_in, tokens_out, updated_at)
       VALUES (?, 'model', 0, ?, ?, ?)
       ON CONFLICT(day, kind) DO UPDATE SET
         tokens_in = tokens_in + excluded.tokens_in,
         tokens_out = tokens_out + excluded.tokens_out,
         updated_at = excluded.updated_at`,
    )
    .bind(todayKey(now), tokensIn, tokensOut, now.toISOString())
    .run();
}
