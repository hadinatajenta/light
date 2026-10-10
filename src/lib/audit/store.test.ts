import { describe, expect, it } from 'vitest';
import {
  type AuditContext,
  type AuditFinding,
  type AuditPostInput,
  type AuditSeverity,
  buildAuditReport,
  evaluatePost,
  findDuplicateTitleIds,
  scoreFindings,
} from './store';

const NOW = new Date('2026-10-11T00:00:00.000Z');

const H2_SECTIONS = [
  '## First section',
  '## Second section',
  '## Third section',
  '## Fourth section',
];
const PRODUCT_LINK = '[the product](product:aeron)';
const INTERNAL_LINK = '[a related post](/blog/related-post)';
const CLEAN_EXTRAS = [...H2_SECTIONS, PRODUCT_LINK, INTERNAL_LINK];

function countWords(value: string): number {
  return value.trim().split(/\s+/).length;
}

function bodyWithWords(wordCount: number, extras: string[] = CLEAN_EXTRAS): string {
  const fixed = extras.join('\n\n');
  const filler = Array.from({ length: wordCount - countWords(fixed) }, () => 'filler').join(' ');
  return `${fixed}\n\n${filler}`;
}

function makePost(overrides: Partial<AuditPostInput> = {}): AuditPostInput {
  return {
    id: 'post-1',
    title: 'A guide to espresso machines',
    description: 'A practical guide to choosing an espresso machine for a small kitchen.',
    body: bodyWithWords(1000),
    coverUrl: 'https://example.com/cover.jpg',
    focusKeyword: 'espresso machine',
    pubDate: '2026-09-01T00:00:00.000Z',
    updatedDate: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeContext(overrides: Partial<AuditContext> = {}): AuditContext {
  return {
    now: NOW,
    knownProductSlugs: new Set(['aeron']),
    duplicateTitleIds: new Set<string>(),
    ...overrides,
  };
}

function rulesOf(findings: AuditFinding[]): string[] {
  return findings.map((finding) => finding.rule);
}

function findingOf(findings: AuditFinding[], rule: string): AuditFinding | undefined {
  return findings.find((finding) => finding.rule === rule);
}

function finding(rule: string, severity: AuditSeverity): AuditFinding {
  return { rule, severity, message: `${rule} failed` };
}

describe('evaluatePost', () => {
  it('reports nothing for an article that passes every check', () => {
    expect(evaluatePost(makePost(), makeContext())).toEqual([]);
  });
});

describe('title-length', () => {
  it('flags a title of 9 characters as high', () => {
    const result = findingOf(evaluatePost(makePost({ title: 'Espresso!' }), makeContext()), 'title-length');

    expect(result?.severity).toBe('high');
    expect(result?.message).toBe('Title is 9 characters; the range is 10 to 70.');
  });

  it('accepts titles of exactly 10 and 70 characters', () => {
    const minimum = evaluatePost(makePost({ title: 'Espresso A' }), makeContext());
    const maximum = evaluatePost(makePost({ title: 'A'.repeat(70) }), makeContext());

    expect(rulesOf(minimum)).not.toContain('title-length');
    expect(rulesOf(maximum)).not.toContain('title-length');
  });

  it('flags a title of 71 characters', () => {
    const result = evaluatePost(makePost({ title: 'A'.repeat(71) }), makeContext());

    expect(rulesOf(result)).toContain('title-length');
  });
});

describe('description-length', () => {
  it('flags a description of 49 characters as high', () => {
    const result = findingOf(
      evaluatePost(makePost({ description: 'A'.repeat(49) }), makeContext()),
      'description-length',
    );

    expect(result?.severity).toBe('high');
    expect(result?.message).toBe('Description is 49 characters; the range is 50 to 160.');
  });

  it('accepts descriptions of exactly 50 and 160 characters', () => {
    const minimum = evaluatePost(makePost({ description: 'A'.repeat(50) }), makeContext());
    const maximum = evaluatePost(makePost({ description: 'A'.repeat(160) }), makeContext());

    expect(rulesOf(minimum)).not.toContain('description-length');
    expect(rulesOf(maximum)).not.toContain('description-length');
  });

  it('flags a description of 161 characters', () => {
    const result = evaluatePost(makePost({ description: 'A'.repeat(161) }), makeContext());

    expect(rulesOf(result)).toContain('description-length');
  });
});

describe('thin-content', () => {
  it('flags a body of 899 words as high', () => {
    const result = findingOf(
      evaluatePost(makePost({ body: bodyWithWords(899) }), makeContext()),
      'thin-content',
    );

    expect(result?.severity).toBe('high');
    expect(result?.message).toBe('Body is 899 words; the minimum is 900.');
  });

  it('accepts a body of exactly 900 words', () => {
    const result = evaluatePost(makePost({ body: bodyWithWords(900) }), makeContext());

    expect(rulesOf(result)).not.toContain('thin-content');
  });
});

describe('missing-cover', () => {
  it('flags a null cover as medium', () => {
    const result = findingOf(evaluatePost(makePost({ coverUrl: null }), makeContext()), 'missing-cover');

    expect(result?.severity).toBe('medium');
  });

  it('flags a blank cover and accepts a set cover', () => {
    const blank = evaluatePost(makePost({ coverUrl: '   ' }), makeContext());
    const set = evaluatePost(makePost(), makeContext());

    expect(rulesOf(blank)).toContain('missing-cover');
    expect(rulesOf(set)).not.toContain('missing-cover');
  });
});

describe('no-affiliate-link', () => {
  it('flags a body without a product link as medium', () => {
    const body = bodyWithWords(1000, [...H2_SECTIONS, INTERNAL_LINK]);
    const result = findingOf(evaluatePost(makePost({ body }), makeContext()), 'no-affiliate-link');

    expect(result?.severity).toBe('medium');
    expect(result?.message).toBe('No product link found. Add at least one affiliate product link.');
  });

  it('accepts a body with a product link', () => {
    const result = evaluatePost(makePost(), makeContext());

    expect(rulesOf(result)).not.toContain('no-affiliate-link');
  });
});

describe('broken-product-reference', () => {
  it('flags a link to an unknown product as high', () => {
    const body = bodyWithWords(1000, [
      ...H2_SECTIONS,
      '[the product](product:missing-model)',
      INTERNAL_LINK,
    ]);
    const result = findingOf(
      evaluatePost(makePost({ body }), makeContext()),
      'broken-product-reference',
    );

    expect(result?.severity).toBe('high');
    expect(result?.message).toBe(
      'Product link points to "missing-model", which is not in the catalog. Fix the link or add the product.',
    );
  });

  it('names every unknown product in one finding', () => {
    const body = bodyWithWords(1000, [
      ...H2_SECTIONS,
      '[one](product:missing-one)',
      '[two](product:missing-two)',
      INTERNAL_LINK,
    ]);
    const result = findingOf(
      evaluatePost(makePost({ body }), makeContext()),
      'broken-product-reference',
    );

    expect(result?.message).toBe(
      '2 product links point to unknown products: "missing-one", "missing-two". Fix them or add the products.',
    );
  });

  it('accepts a link to a known product', () => {
    const result = evaluatePost(makePost(), makeContext());

    expect(rulesOf(result)).not.toContain('broken-product-reference');
  });
});

describe('no-internal-links', () => {
  it('flags a body with only external links as medium', () => {
    const body = bodyWithWords(1000, [
      ...H2_SECTIONS,
      PRODUCT_LINK,
      '[an external guide](https://example.com/guide)',
    ]);
    const result = findingOf(evaluatePost(makePost({ body }), makeContext()), 'no-internal-links');

    expect(result?.severity).toBe('medium');
    expect(result?.message).toBe(
      'No link to another article. Add at least one link to a related post.',
    );
  });

  it('accepts a body with a link to /blog/', () => {
    const result = evaluatePost(makePost(), makeContext());

    expect(rulesOf(result)).not.toContain('no-internal-links');
  });
});

describe('heading-structure', () => {
  it('flags a body with three H2 headings as medium', () => {
    const body = bodyWithWords(1000, [...H2_SECTIONS.slice(0, 3), PRODUCT_LINK, INTERNAL_LINK]);
    const result = findingOf(evaluatePost(makePost({ body }), makeContext()), 'heading-structure');

    expect(result?.severity).toBe('medium');
    expect(result?.message).toBe('Body has 3 H2 headings; the minimum is 4.');
  });

  it('accepts a body with exactly four H2 headings and no H1', () => {
    const result = evaluatePost(makePost(), makeContext());

    expect(rulesOf(result)).not.toContain('heading-structure');
  });

  it('flags an H1 heading even when there are four H2 headings', () => {
    const body = bodyWithWords(1000, ['# Getting started', ...CLEAN_EXTRAS]);
    const result = findingOf(evaluatePost(makePost({ body }), makeContext()), 'heading-structure');

    expect(result?.severity).toBe('medium');
    expect(result?.message).toBe(
      'Body contains an H1 heading ("Getting started"). The page title is already the H1, so start sections at H2.',
    );
  });

  it('flags an H1 and too few H2 headings in one finding', () => {
    const body = bodyWithWords(1000, [
      '# Getting started',
      ...H2_SECTIONS.slice(0, 2),
      PRODUCT_LINK,
      INTERNAL_LINK,
    ]);
    const result = findingOf(evaluatePost(makePost({ body }), makeContext()), 'heading-structure');

    expect(result?.message).toBe(
      'Body contains an H1 heading ("Getting started") and only 2 H2 headings. Use at least 4 H2 headings and no H1.',
    );
  });
});

describe('stale', () => {
  it('flags an article last updated 181 days ago as low', () => {
    const result = findingOf(
      evaluatePost(makePost({ updatedDate: '2026-04-13T00:00:00.000Z' }), makeContext()),
      'stale',
    );

    expect(result?.severity).toBe('low');
    expect(result?.message).toBe(
      'Last updated 181 days ago (2026-04-13). Refresh articles older than 180 days.',
    );
  });

  it('accepts an article last updated exactly 180 days ago', () => {
    const result = evaluatePost(
      makePost({ updatedDate: '2026-04-14T00:00:00.000Z' }),
      makeContext(),
    );

    expect(rulesOf(result)).not.toContain('stale');
  });

  it('falls back to the publish date when there is no update date', () => {
    const result = findingOf(
      evaluatePost(
        makePost({ updatedDate: null, pubDate: '2026-01-01T00:00:00.000Z' }),
        makeContext(),
      ),
      'stale',
    );

    expect(result?.message).toBe(
      'Last published 283 days ago (2026-01-01). Refresh articles older than 180 days.',
    );
  });

  it('ignores an article with no dates at all', () => {
    const result = evaluatePost(makePost({ updatedDate: null, pubDate: null }), makeContext());

    expect(rulesOf(result)).not.toContain('stale');
  });
});

describe('duplicate-title', () => {
  it('flags a post whose title is shared with another published post as high', () => {
    const result = findingOf(
      evaluatePost(makePost(), makeContext({ duplicateTitleIds: new Set(['post-1']) })),
      'duplicate-title',
    );

    expect(result?.severity).toBe('high');
    expect(result?.message).toBe(
      'Title "A guide to espresso machines" is also used by another published article. Give one of them a distinct title.',
    );
  });

  it('accepts a unique title', () => {
    const result = evaluatePost(makePost(), makeContext());

    expect(rulesOf(result)).not.toContain('duplicate-title');
  });
});

describe('findDuplicateTitleIds', () => {
  it('groups titles ignoring case and repeated whitespace', () => {
    const duplicateIds = findDuplicateTitleIds([
      { id: 'a', title: 'Espresso   Machines' },
      { id: 'b', title: 'espresso machines' },
      { id: 'c', title: 'Grinders' },
    ]);

    expect([...duplicateIds].sort()).toEqual(['a', 'b']);
  });
});

describe('keyword-not-in-title', () => {
  it('flags a focus keyword missing from the title as low', () => {
    const result = findingOf(
      evaluatePost(makePost({ focusKeyword: 'grinder burr' }), makeContext()),
      'keyword-not-in-title',
    );

    expect(result?.severity).toBe('low');
    expect(result?.message).toBe(
      'Focus keyword "grinder burr" does not appear in the title. Add it or clear the keyword.',
    );
  });

  it('matches the keyword case-insensitively', () => {
    const result = evaluatePost(makePost({ focusKeyword: 'ESPRESSO MACHINE' }), makeContext());

    expect(rulesOf(result)).not.toContain('keyword-not-in-title');
  });

  it('ignores an absent or blank keyword', () => {
    const absent = evaluatePost(makePost({ focusKeyword: null }), makeContext());
    const blank = evaluatePost(makePost({ focusKeyword: '   ' }), makeContext());

    expect(rulesOf(absent)).not.toContain('keyword-not-in-title');
    expect(rulesOf(blank)).not.toContain('keyword-not-in-title');
  });
});

describe('scoreFindings', () => {
  it('scores a clean article at 100', () => {
    expect(scoreFindings([])).toBe(100);
  });

  it('subtracts 20 per high, 8 per medium, and 3 per low', () => {
    expect(scoreFindings([finding('a', 'high')])).toBe(80);
    expect(scoreFindings([finding('a', 'high'), finding('b', 'medium')])).toBe(72);
    expect(scoreFindings([finding('a', 'high'), finding('b', 'medium'), finding('c', 'low')])).toBe(
      69,
    );
  });

  it('floors the score at zero', () => {
    const findings = [
      finding('a', 'high'),
      finding('b', 'high'),
      finding('c', 'high'),
      finding('d', 'high'),
      finding('e', 'high'),
      finding('f', 'high'),
    ];

    expect(scoreFindings(findings)).toBe(0);
  });
});

describe('buildAuditReport', () => {
  it('orders the worst articles first and summarises the run', () => {
    const report = buildAuditReport(
      [
        { id: 'a', title: 'Alpha', findings: [finding('title-length', 'high')] },
        {
          id: 'b',
          title: 'Bravo',
          findings: [finding('title-length', 'high'), finding('missing-cover', 'medium')],
        },
        { id: 'c', title: 'Charlie', findings: [finding('stale', 'low')] },
        { id: 'd', title: 'Delta', findings: [] },
      ],
      '2026-10-11T00:00:00.000Z',
    );

    expect(report.posts.map((post) => post.id)).toEqual(['b', 'a', 'c', 'd']);
    expect(report.totals).toEqual({ posts: 4, clean: 1, withHigh: 2, averageScore: 87 });
    expect(report.byRule).toEqual([
      { rule: 'title-length', severity: 'high', count: 2 },
      { rule: 'missing-cover', severity: 'medium', count: 1 },
      { rule: 'stale', severity: 'low', count: 1 },
    ]);
  });

  it('reports zeroed totals when nothing is published', () => {
    const report = buildAuditReport([], '2026-10-11T00:00:00.000Z');

    expect(report.totals).toEqual({ posts: 0, clean: 0, withHigh: 0, averageScore: 0 });
    expect(report.byRule).toEqual([]);
    expect(report.posts).toEqual([]);
  });
});
