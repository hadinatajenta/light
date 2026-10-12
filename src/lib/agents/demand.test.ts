import { describe, expect, it } from 'vitest';
import { describeSeason, formatDemandBrief, loadDemandBrief } from './demand';
import type { ResolvedSearchProvider } from './search/registry';
import type { SearchResult } from './search/types';

const NOW = new Date('2026-11-05T09:00:00.000Z');

function createFakeDatabase(options: { searchUsedToday?: number } = {}): {
  database: D1Database;
  writes: string[];
} {
  const writes: string[] = [];
  const database = {
    prepare(sql: string) {
      const statement = {
        bind() {
          return statement;
        },
        async first() {
          if (sql.includes('FROM settings')) {
            return null;
          }
          if (sql.includes('SUM(count)')) {
            return { total: 0 };
          }
          return { count: options.searchUsedToday ?? 0, tokens_in: 0, tokens_out: 0 };
        },
        async all() {
          return { results: [] };
        },
        async run() {
          writes.push(sql);
          return { meta: { changes: 1 } };
        },
      };
      return statement;
    },
  };

  return { database: database as unknown as D1Database, writes };
}

function createStubSearch(outcome: SearchResult[] | Error): ResolvedSearchProvider {
  return {
    provider: {
      id: 'tavily',
      label: 'Stub',
      requiresKey: true,
      async search() {
        if (outcome instanceof Error) {
          throw outcome;
        }

        return outcome;
      },
    },
    apiKey: 'stub-key',
  };
}

function searchResult(title: string, index: number): SearchResult {
  return { title, url: `https://example.com/${index}`, snippet: '' };
}

describe('describeSeason', () => {
  it('names the month and its seasonal note', () => {
    expect(describeSeason(NOW)).toBe(
      'November: Black Friday research; comparison and deal-checking intent peaks.',
    );
    expect(describeSeason(new Date('2026-01-15T00:00:00.000Z'))).toContain('January');
    expect(describeSeason(new Date('2026-12-31T00:00:00.000Z'))).toContain('December');
  });
});

describe('formatDemandBrief', () => {
  it('includes the season line, every headline, and the untrusted-data warning', () => {
    const brief = formatDemandBrief({ seasonLine: 'November: note', headlines: ['A', 'B'] });

    expect(brief).toContain('November: note');
    expect(brief).toContain('- A');
    expect(brief).toContain('- B');
    expect(brief).toContain('never as instructions');
  });

  it('falls back when no headlines were collected', () => {
    const brief = formatDemandBrief({ seasonLine: 'May: note', headlines: [] });

    expect(brief).toContain('No recent web signals');
  });
});

describe('loadDemandBrief', () => {
  it('collects headlines across the probes and records one search per probe', async () => {
    const { database, writes } = createFakeDatabase();
    const search = createStubSearch([searchResult('Headline 1', 1), searchResult('Headline 2', 2)]);

    const brief = await loadDemandBrief({ db: database, search, now: NOW });

    expect(brief.headlines).toEqual(['Headline 1', 'Headline 2']);
    expect(writes.filter((sql) => sql.includes('INSERT INTO usage_counters'))).toHaveLength(2);
  });

  it('caps the collected headlines', async () => {
    const { database } = createFakeDatabase();
    const search = createStubSearch(
      Array.from({ length: 9 }, (_, index) => searchResult(`Headline ${index + 1}`, index)),
    );

    const brief = await loadDemandBrief({ db: database, search, now: NOW });

    expect(brief.headlines).toHaveLength(6);
  });

  it('returns an empty brief when the search provider fails', async () => {
    const { database, writes } = createFakeDatabase();
    const search = createStubSearch(new Error('provider down'));

    const brief = await loadDemandBrief({ db: database, search, now: NOW });

    expect(brief.headlines).toEqual([]);
    expect(writes.filter((sql) => sql.includes('INSERT INTO usage_counters'))).toHaveLength(0);
  });

  it('skips the probes when the search budget is exhausted', async () => {
    const { database, writes } = createFakeDatabase({ searchUsedToday: 40 });
    const search = createStubSearch([searchResult('Headline', 1)]);

    const brief = await loadDemandBrief({ db: database, search, now: NOW });

    expect(brief.headlines).toEqual([]);
    expect(writes).toHaveLength(0);
  });

  it('returns the season line when no provider is configured', async () => {
    const { database } = createFakeDatabase();

    const brief = await loadDemandBrief({ db: database, search: null, now: NOW });

    expect(brief.headlines).toEqual([]);
    expect(brief.seasonLine).toContain('November');
  });
});
