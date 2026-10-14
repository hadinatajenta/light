import { describe, expect, it } from 'vitest';
import { ApiError } from '../../errors';
import {
  type AffiliateReportLine,
  buildLineSignature,
  detectReportDelimiter,
  hashLineSignature,
  parseAffiliateReport,
  parseAmountToCents,
  parseDelimitedRows,
  parseReportCount,
  parseReportDay,
} from './report-parse';

const HEADER = 'Order ID,Order Date,ASIN,Item Commission,Currency,Order Status,Clicks,Orders\n';
const LINES = [
  '111-2223334,2026-02-20,B0TEST,"1,234.56",USD,Shipped,3,1',
  '111-2223335,2026-02-21,B0MISSING,"1.234,56",USD,Shipped,0,2',
].join('\n');

describe('detectReportDelimiter', () => {
  it('picks the delimiter with the most separators outside quotes', () => {
    expect(detectReportDelimiter('a\tb\tc')).toBe('\t');
    expect(detectReportDelimiter('a,b,c')).toBe(',');
    expect(detectReportDelimiter('"a,b"\t"c,d"\te')).toBe('\t');
    expect(detectReportDelimiter('single')).toBe(',');
  });
});

describe('parseDelimitedRows', () => {
  it('parses quoted cells, escaped quotes, crlf, and embedded newlines', () => {
    const rows = parseDelimitedRows('a,"b,1",c\r\n"say ""hi""","multi\nline",x', ',');

    expect(rows).toEqual([
      ['a', 'b,1', 'c'],
      ['say "hi"', 'multi\nline', 'x'],
    ]);
  });
});

describe('parseAmountToCents', () => {
  it('accepts both decimal conventions', () => {
    expect(parseAmountToCents('1,234.56')).toBe(123456);
    expect(parseAmountToCents('1.234,56')).toBe(123456);
    expect(parseAmountToCents('12,50')).toBe(1250);
  });

  it('strips currency symbols and handles signs and parentheses', () => {
    expect(parseAmountToCents('$1,234')).toBe(123400);
    expect(parseAmountToCents('-3.50')).toBe(-350);
    expect(parseAmountToCents('(12.50)')).toBe(-1250);
    expect(parseAmountToCents('USD 0.99')).toBe(99);
  });

  it('returns null for empty or non numeric cells', () => {
    expect(parseAmountToCents('')).toBeNull();
    expect(parseAmountToCents('   ')).toBeNull();
    expect(parseAmountToCents('n/a')).toBeNull();
  });
});

describe('parseReportCount', () => {
  it('reads integer counts', () => {
    expect(parseReportCount('3')).toBe(3);
    expect(parseReportCount('1,234')).toBe(1234);
    expect(parseReportCount('-2')).toBe(0);
    expect(parseReportCount('')).toBeNull();
  });
});

describe('parseReportDay', () => {
  it('accepts iso and month first dates', () => {
    expect(parseReportDay('2026-02-20')).toBe('2026-02-20');
    expect(parseReportDay('2026-02-20T00:00:00Z')).toBe('2026-02-20');
    expect(parseReportDay('2/20/2026')).toBe('2026-02-20');
  });

  it('rejects impossible or unreadable dates', () => {
    expect(parseReportDay('2026-02-30')).toBeNull();
    expect(parseReportDay('13/2/2026')).toBeNull();
    expect(parseReportDay('yesterday')).toBeNull();
    expect(parseReportDay('')).toBeNull();
  });
});

describe('parseAffiliateReport', () => {
  it('maps the common amazon headers and both decimal formats', () => {
    const parsed = parseAffiliateReport(HEADER + LINES);

    expect(parsed.delimiter).toBe(',');
    expect(parsed.lines).toHaveLength(2);
    expect(parsed.lines[0]).toEqual({
      orderId: '111-2223334',
      orderDay: '2026-02-20',
      target: 'B0TEST',
      clicks: 3,
      orders: 1,
      commissionCents: 123456,
      currency: 'USD',
      status: 'Shipped',
    });
    expect(parsed.lines[1]).toMatchObject({
      target: 'B0MISSING',
      commissionCents: 123456,
      orders: 2,
    });
    expect(parsed.mappedColumns).toContain('orderId');
    expect(parsed.skippedRows).toBe(0);
  });

  it('accepts a tab separated export with alias headers', () => {
    const text = [
      'Amazon Order ID\tOrder Date\tASIN\tTotal Commission\tCurrency Code\tOrder Status',
      '222-3334445\t3/1/2026\tB0OTHER\t0,00\tUSD\tPending',
    ].join('\n');
    const parsed = parseAffiliateReport(text);

    expect(parsed.delimiter).toBe('\t');
    expect(parsed.lines[0]).toMatchObject({
      orderId: '222-3334445',
      orderDay: '2026-03-01',
      target: 'B0OTHER',
      commissionCents: 0,
      currency: 'USD',
      clicks: 0,
      orders: 1,
    });
  });

  it('rejects a file whose required columns cannot be mapped and names the headers', () => {
    try {
      parseAffiliateReport('Foo,Bar\n1,2');
      throw new Error('expected parseAffiliateReport to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).code).toBe('ANALYST_REPORT_INVALID');
      expect((error as ApiError).details).toMatchObject({ headers: ['Foo', 'Bar'] });
    }
  });

  it('skips rows without a complete observation and counts them', () => {
    const text = [
      HEADER.trimEnd(),
      '111-2223336,2026-02-22,B0TEST,5.00,USD,Shipped',
      'Total,,,5.00,,',
      '111-2223337,not-a-date,B0TEST,5.00,USD,Shipped',
      '111-2223338,2026-02-23,B0TEST,,USD,Shipped',
    ].join('\n');
    const parsed = parseAffiliateReport(text);

    expect(parsed.lines).toHaveLength(1);
    expect(parsed.skippedRows).toBe(3);
  });
});

describe('line signatures', () => {
  it('differ when amazon revises an amount and match when the observation repeats', async () => {
    const line: AffiliateReportLine = {
      orderId: '1',
      orderDay: '2026-02-20',
      target: 'B0TEST',
      clicks: 0,
      orders: 1,
      commissionCents: 100,
      currency: 'USD',
      status: 'Shipped',
    };
    const revised = { ...line, commissionCents: 250 };

    expect(buildLineSignature(line)).toBe(buildLineSignature({ ...line }));
    expect(buildLineSignature(line)).not.toBe(buildLineSignature(revised));
    await expect(hashLineSignature(buildLineSignature(line))).resolves.toMatch(/^[0-9a-f]{64}$/);
    await expect(hashLineSignature(buildLineSignature(line))).resolves.toBe(
      await hashLineSignature(buildLineSignature({ ...line })),
    );
  });
});
