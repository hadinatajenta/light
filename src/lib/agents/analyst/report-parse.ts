import { ApiError } from '../../errors';

export const AFFILIATE_REPORT_MAX_LINES = 50_000;

export const CANONICAL_REPORT_COLUMNS = [
  'orderId',
  'orderDate',
  'target',
  'commission',
  'currency',
  'status',
  'clicks',
  'orders',
] as const;

export type CanonicalReportColumn = (typeof CANONICAL_REPORT_COLUMNS)[number];

const REQUIRED_COLUMNS: readonly CanonicalReportColumn[] = [
  'orderId',
  'orderDate',
  'target',
  'commission',
  'currency',
  'status',
];

const HEADER_ALIASES: ReadonlyArray<readonly [string, CanonicalReportColumn]> = [
  ['amazonorderid', 'orderId'],
  ['orderreference', 'orderId'],
  ['ordernumber', 'orderId'],
  ['orderid', 'orderId'],
  ['order', 'orderId'],
  ['orderdate', 'orderDate'],
  ['purchasedate', 'orderDate'],
  ['date', 'orderDate'],
  ['productasin', 'target'],
  ['childasin', 'target'],
  ['asin', 'target'],
  ['itemcommission', 'commission'],
  ['totalcommission', 'commission'],
  ['itemearnings', 'commission'],
  ['commission', 'commission'],
  ['earnings', 'commission'],
  ['currencycode', 'currency'],
  ['currency', 'currency'],
  ['orderstatus', 'status'],
  ['status', 'status'],
  ['clickcount', 'clicks'],
  ['clicks', 'clicks'],
  ['ordercount', 'orders'],
  ['orders', 'orders'],
];

const ALIAS_TARGETS = new Map<string, CanonicalReportColumn>();
const ALIAS_RANKS = new Map<string, number>();

HEADER_ALIASES.forEach(([alias, column], index) => {
  ALIAS_TARGETS.set(alias, column);
  ALIAS_RANKS.set(alias, index);
});

export interface AffiliateReportLine {
  orderId: string;
  orderDay: string;
  target: string;
  clicks: number;
  orders: number;
  commissionCents: number;
  currency: string;
  status: string;
}

export interface ParsedAffiliateReport {
  delimiter: ',' | '\t';
  headers: string[];
  mappedColumns: CanonicalReportColumn[];
  lines: AffiliateReportLine[];
  skippedRows: number;
}

function invalidReport(message: string, details?: unknown): ApiError {
  return new ApiError(422, 'ANALYST_REPORT_INVALID', message, details);
}

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function detectReportDelimiter(firstLine: string): ',' | '\t' {
  let tabs = 0;
  let commas = 0;
  let inQuotes = false;

  for (const character of firstLine) {
    if (character === '"') {
      inQuotes = !inQuotes;
    } else if (!inQuotes && character === '\t') {
      tabs += 1;
    } else if (!inQuotes && character === ',') {
      commas += 1;
    }
  }

  return tabs > commas ? '\t' : ',';
}

export function parseDelimitedRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (inQuotes) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += character;
      }
    } else if (character === '"') {
      inQuotes = true;
    } else if (character === delimiter) {
      row.push(cell);
      cell = '';
    } else if (character === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (character === '\r') {
      if (text[index + 1] !== '\n') {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
      }
    } else {
      cell += character;
    }
  }

  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

export function parseReportDay(value: string): string | null {
  const trimmed = value.trim();

  if (trimmed === '') {
    return null;
  }

  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/.exec(trimmed);
  const numeric = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  let year: number;
  let month: number;
  let day: number;

  if (iso) {
    year = Number.parseInt(iso[1], 10);
    month = Number.parseInt(iso[2], 10);
    day = Number.parseInt(iso[3], 10);
  } else if (numeric) {
    year = Number.parseInt(numeric[3], 10);
    month = Number.parseInt(numeric[1], 10);
    day = Number.parseInt(numeric[2], 10);
  } else {
    return null;
  }

  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
}

export function parseAmountToCents(value: string): number | null {
  const trimmed = value.trim();

  if (trimmed === '') {
    return null;
  }

  const negative = trimmed.startsWith('-') || (trimmed.startsWith('(') && trimmed.endsWith(')'));
  const digits = trimmed.replace(/[^\d.,]/g, '');

  if (digits === '') {
    return null;
  }

  let normalized: string;

  if (digits.includes(',') && digits.includes('.')) {
    const decimalSeparator = digits.lastIndexOf(',') > digits.lastIndexOf('.') ? ',' : '.';
    const groupSeparator = decimalSeparator === ',' ? '.' : ',';
    normalized = digits.replaceAll(groupSeparator, '').replace(decimalSeparator, '.');
  } else if (digits.includes(',')) {
    const parts = digits.split(',');
    normalized =
      parts.length === 2 && parts[1].length !== 3 ? `${parts[0]}.${parts[1]}` : parts.join('');
  } else if (digits.includes('.')) {
    const parts = digits.split('.');
    normalized =
      parts.length === 2 && parts[1].length !== 3 ? `${parts[0]}.${parts[1]}` : parts.join('');
  } else {
    normalized = digits;
  }

  const amount = Number.parseFloat(normalized);

  if (!Number.isFinite(amount)) {
    return null;
  }

  const cents = Math.round(amount * 100);

  return negative ? -cents : cents;
}

export function parseReportCount(value: string): number | null {
  const cents = parseAmountToCents(value);

  return cents === null ? null : Math.max(Math.trunc(cents / 100), 0);
}

export function buildLineSignature(line: AffiliateReportLine): string {
  return [
    line.orderId,
    line.target,
    line.orderDay,
    String(line.commissionCents),
    line.currency,
    line.status,
  ].join('|');
}

export async function hashLineSignature(signature: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(signature));

  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function resolveColumnMap(headers: readonly string[]): Map<CanonicalReportColumn, number> {
  const indexByColumn = new Map<CanonicalReportColumn, number>();
  const rankByColumn = new Map<CanonicalReportColumn, number>();

  headers.forEach((header, index) => {
    const alias = normalizeHeader(header);
    const column = ALIAS_TARGETS.get(alias);

    if (!column) {
      return;
    }

    const rank = ALIAS_RANKS.get(alias) ?? Number.MAX_SAFE_INTEGER;
    const currentRank = rankByColumn.get(column);

    if (currentRank === undefined || rank < currentRank) {
      indexByColumn.set(column, index);
      rankByColumn.set(column, rank);
    }
  });

  return indexByColumn;
}

function isBlankRow(cells: readonly string[]): boolean {
  return cells.every((cell) => cell.trim() === '');
}

export function parseAffiliateReport(text: string): ParsedAffiliateReport {
  const withoutBom = text.startsWith('\uFEFF') ? text.slice(1) : text;

  if (withoutBom.trim() === '') {
    throw invalidReport('The affiliate report is empty.');
  }

  const firstLineBreak = withoutBom.search(/\r?\n/);
  const firstLine = firstLineBreak >= 0 ? withoutBom.slice(0, firstLineBreak) : withoutBom;
  const delimiter = detectReportDelimiter(firstLine);
  const rows = parseDelimitedRows(withoutBom, delimiter).filter((row) => !isBlankRow(row));

  if (rows.length === 0) {
    throw invalidReport('The affiliate report has no rows.');
  }

  const headers = rows[0].map((header) => header.trim());
  const columnIndex = resolveColumnMap(headers);
  const missing = REQUIRED_COLUMNS.filter((column) => !columnIndex.has(column));

  if (missing.length > 0) {
    throw invalidReport(
      `The affiliate report is missing the required column(s): ${missing.join(', ')}.`,
      { headers, missing },
    );
  }

  const lines: AffiliateReportLine[] = [];
  let skippedRows = 0;

  for (const row of rows.slice(1)) {
    if (lines.length >= AFFILIATE_REPORT_MAX_LINES) {
      throw new ApiError(
        413,
        'ANALYST_REPORT_TOO_LARGE',
        `The affiliate report exceeds ${AFFILIATE_REPORT_MAX_LINES} lines.`,
      );
    }

    const read = (column: CanonicalReportColumn): string => {
      const index = columnIndex.get(column);
      return index === undefined ? '' : (row[index] ?? '').trim();
    };

    const orderId = read('orderId');
    const orderDay = parseReportDay(read('orderDate'));
    const target = read('target');
    const commissionCents = parseAmountToCents(read('commission'));
    const currency = read('currency').toUpperCase();
    const status = read('status');

    if (
      orderId === '' ||
      orderDay === null ||
      target === '' ||
      commissionCents === null ||
      currency === '' ||
      status === ''
    ) {
      skippedRows += 1;
      continue;
    }

    const clicks = parseReportCount(read('clicks'));
    const orders = parseReportCount(read('orders'));

    lines.push({
      orderId,
      orderDay,
      target,
      clicks: clicks ?? 0,
      orders: orders ?? 1,
      commissionCents,
      currency,
      status,
    });
  }

  return {
    delimiter,
    headers,
    mappedColumns: CANONICAL_REPORT_COLUMNS.filter((column) => columnIndex.has(column)),
    lines,
    skippedRows,
  };
}
