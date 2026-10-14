import type { AffiliateNetwork } from '@/config/monetization';
import { AFFILIATE_NETWORKS } from '../../affiliate/store';
import { addViewDays } from '../../analytics/views';
import { ApiError } from '../../errors';
import {
  buildLineSignature,
  hashLineSignature,
  parseAffiliateReport,
  parseReportDay,
} from './report-parse';
import type { AnalystWindow } from './window';

export const COMMISSION_COVERAGE_STATES = ['known', 'partial', 'unknown'] as const;

export type CommissionCoverageState = (typeof COMMISSION_COVERAGE_STATES)[number];

export interface AffiliateReportPeriod {
  periodStart: string;
  periodEnd: string;
}

export interface CommissionCoverage {
  state: CommissionCoverageState;
  coveredDays: number;
  totalDays: number;
  latestPeriodEnd: string | null;
}

export interface CommissionLineCounts {
  lines: number;
  unmatched: number;
}

export interface AnalystCommissionRow {
  productId: string;
  orders: number;
  commissionCents: number;
}

export interface ImportAffiliateReportInput {
  network: AffiliateNetwork;
  periodStart: string;
  periodEnd: string;
  sourceFilename: string | null;
  importedBy: string | null;
  content: string;
}

export interface ImportAffiliateReportResult {
  reportId: string;
  imported: number;
  unmatched: number;
  skipped: number;
}

function invalidReport(message: string, details?: unknown): ApiError {
  return new ApiError(422, 'ANALYST_REPORT_INVALID', message, details);
}

export function isAffiliateNetwork(value: string): value is AffiliateNetwork {
  return (AFFILIATE_NETWORKS as readonly string[]).includes(value);
}

function countDays(from: string, to: string): number {
  let days = 0;

  for (let day = from; day <= to; day = addViewDays(day, 1)) {
    days += 1;
  }

  return days;
}

export function resolveCommissionCoverage(
  reports: readonly AffiliateReportPeriod[],
  window: AnalystWindow,
): CommissionCoverage {
  const totalDays = countDays(window.start, window.end);
  let coveredDays = 0;

  for (let day = window.start; day <= window.end; day = addViewDays(day, 1)) {
    if (reports.some((report) => report.periodStart <= day && day <= report.periodEnd)) {
      coveredDays += 1;
    }
  }

  const latestPeriodEnd = reports.reduce<string | null>(
    (latest, report) => (latest === null || report.periodEnd > latest ? report.periodEnd : latest),
    null,
  );

  return {
    state: coveredDays === 0 ? 'unknown' : coveredDays >= totalDays ? 'known' : 'partial',
    coveredDays,
    totalDays,
    latestPeriodEnd,
  };
}

export async function readCommissionCoverage(
  db: D1Database,
  window: AnalystWindow,
): Promise<CommissionCoverage> {
  const result = await db
    .prepare(
      `SELECT period_start, period_end FROM affiliate_earnings_reports
       WHERE period_start <= ? AND period_end >= ?`,
    )
    .bind(window.end, window.start)
    .all<{ period_start: string; period_end: string }>();

  const reports = (result.results ?? []).map((row) => ({
    periodStart: row.period_start,
    periodEnd: row.period_end,
  }));

  return resolveCommissionCoverage(reports, window);
}

export async function readCommissionLineCounts(
  db: D1Database,
  window: AnalystWindow,
): Promise<CommissionLineCounts> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS lines,
              COALESCE(SUM(CASE WHEN product_id IS NULL THEN 1 ELSE 0 END), 0) AS unmatched
       FROM affiliate_earnings_lines
       WHERE order_day >= ? AND order_day <= ?`,
    )
    .bind(window.start, window.end)
    .first<{ lines: number; unmatched: number }>();

  return { lines: row?.lines ?? 0, unmatched: row?.unmatched ?? 0 };
}

export async function readCommissionByProduct(
  db: D1Database,
  window: AnalystWindow,
): Promise<AnalystCommissionRow[]> {
  const result = await db
    .prepare(
      `SELECT product_id, SUM(orders) AS orders, SUM(commission_cents) AS commission_cents
       FROM affiliate_earnings_lines
       WHERE product_id IS NOT NULL AND order_day >= ? AND order_day <= ?
       GROUP BY product_id`,
    )
    .bind(window.start, window.end)
    .all<{ product_id: string; orders: number; commission_cents: number }>();

  return (result.results ?? []).map((row) => ({
    productId: row.product_id,
    orders: row.orders ?? 0,
    commissionCents: row.commission_cents ?? 0,
  }));
}

interface ProductTargetRow {
  id: string;
  target: string;
}

async function loadProductIdsByTarget(
  db: D1Database,
  network: AffiliateNetwork,
): Promise<Map<string, string>> {
  const result = await db
    .prepare(
      `SELECT p.id AS id, p.target AS target
       FROM affiliate_products p
       JOIN affiliate_programs pr ON pr.id = p.program_id
       WHERE pr.network = ?`,
    )
    .bind(network)
    .all<ProductTargetRow>();
  const byTarget = new Map<string, string>();

  for (const row of result.results ?? []) {
    byTarget.set(row.target.trim().toUpperCase(), row.id);
  }

  return byTarget;
}

export function validateReportPeriod(periodStart: string, periodEnd: string): void {
  const start = parseReportDay(periodStart);
  const end = parseReportDay(periodEnd);

  if (start === null || end === null) {
    throw invalidReport('Use YYYY-MM-DD dates for the report period.');
  }

  if (start > end) {
    throw invalidReport('The report period ends before it starts.');
  }
}

export async function importAffiliateReport(
  db: D1Database,
  input: ImportAffiliateReportInput,
): Promise<ImportAffiliateReportResult> {
  if (!isAffiliateNetwork(input.network)) {
    throw invalidReport(`The network "${input.network}" is not supported.`);
  }

  validateReportPeriod(input.periodStart, input.periodEnd);

  const parsed = parseAffiliateReport(input.content);
  const productIdByTarget = await loadProductIdsByTarget(db, input.network);
  const nowIso = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO affiliate_earnings_reports
         (id, network, period_start, period_end, source_filename, imported_by, imported_at, line_count, unmatched_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)
       ON CONFLICT(network, period_start, period_end) DO UPDATE SET
         source_filename = excluded.source_filename,
         imported_by = excluded.imported_by,
         imported_at = excluded.imported_at`,
    )
    .bind(
      crypto.randomUUID(),
      input.network,
      input.periodStart,
      input.periodEnd,
      input.sourceFilename,
      input.importedBy,
      nowIso,
    )
    .run();

  const report = await db
    .prepare(
      `SELECT id FROM affiliate_earnings_reports
       WHERE network = ? AND period_start = ? AND period_end = ?`,
    )
    .bind(input.network, input.periodStart, input.periodEnd)
    .first<{ id: string }>();

  if (!report) {
    throw new ApiError(500, 'ANALYST_REPORT_STORE_FAILED', 'The report could not be stored.');
  }

  let imported = 0;
  let unmatched = 0;

  for (const line of parsed.lines) {
    const lineHash = await hashLineSignature(buildLineSignature(line));
    const productId = productIdByTarget.get(line.target.trim().toUpperCase()) ?? null;
    const result = await db
      .prepare(
        `INSERT INTO affiliate_earnings_lines
           (id, report_id, product_id, target, order_day, clicks, orders, commission_cents,
            currency, status, line_hash, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(line_hash) DO NOTHING`,
      )
      .bind(
        crypto.randomUUID(),
        report.id,
        productId,
        line.target,
        line.orderDay,
        line.clicks,
        line.orders,
        line.commissionCents,
        line.currency,
        line.status,
        lineHash,
        nowIso,
      )
      .run();
    const changed = (result.meta as { changes?: number } | undefined)?.changes ?? 0;

    if (changed === 1) {
      imported += 1;

      if (productId === null) {
        unmatched += 1;
      }
    }
  }

  await db
    .prepare(
      `UPDATE affiliate_earnings_reports
       SET line_count = (SELECT COUNT(*) FROM affiliate_earnings_lines WHERE report_id = ?),
           unmatched_count = (SELECT COUNT(*) FROM affiliate_earnings_lines WHERE report_id = ? AND product_id IS NULL)
       WHERE id = ?`,
    )
    .bind(report.id, report.id, report.id)
    .run();

  return {
    reportId: report.id,
    imported,
    unmatched,
    skipped: parsed.skippedRows + (parsed.lines.length - imported),
  };
}
