import { describe, expect, it } from 'vitest';
import {
  auditPost,
  countWords,
  extractFirstParagraph,
  extractHeadings,
  extractInternalPostIds,
  extractLinkHrefs,
  findCannibalization,
  findOrphanPosts,
  isRefreshCandidate,
  normalizeFocusKeyword,
} from './audit';

function buildBody(): string {
  const filler = new Array(950).fill('content').join(' ');
  return [
    'The keyboard intro paragraph explains the keyboard basics.',
    '## Why a keyboard matters',
    filler,
    '## Choosing a keyboard',
    filler,
    '## Keyboard maintenance',
    filler,
    '## Keyboard accessories',
    'Read [monitor guide](/blog/monitor-guide) and [desk guide](/blog/desk-guide).',
    '## Frequently asked questions',
  ].join('\n\n');
}

function makeInput(overrides: Record<string, unknown> = {}) {
  return {
    id: 'best-keyboard',
    title: 'Best budget keyboard guide',
    description:
      'A complete guide to choosing the best budget keyboard for typing, gaming, and everyday work.',
    body: buildBody(),
    tags: ['keyboards'],
    category: 'keyboards',
    focusKeyword: 'keyboard',
    targetIntent: 'informational',
    coverUrl: '/images/cover.jpg',
    coverAlt: 'A budget keyboard on a desk',
    status: 'published',
    pubDate: '2025-01-01T00:00:00.000Z',
    updatedDate: '2025-06-01T00:00:00.000Z',
    now: new Date('2025-07-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('extractHeadings', () => {
  it('reads heading depth and text', () => {
    expect(extractHeadings('# One\n\n## Two\n\n### Three')).toEqual([
      { depth: 1, text: 'One' },
      { depth: 2, text: 'Two' },
      { depth: 3, text: 'Three' },
    ]);
  });

  it('ignores headings inside fenced code', () => {
    expect(extractHeadings('```\n# Not a heading\n```\n\n## Real')).toEqual([
      { depth: 2, text: 'Real' },
    ]);
  });
});

describe('countWords', () => {
  it('counts words outside fenced code', () => {
    expect(countWords('one two\n\n```\nthree four five\n```\n\nsix')).toBe(3);
  });
});

describe('extractLinkHrefs', () => {
  it('collects markdown and html links', () => {
    expect(extractLinkHrefs('[a](/blog/a) <a href="https://example.com">x</a>')).toEqual([
      '/blog/a',
      'https://example.com',
    ]);
  });
});

describe('extractInternalPostIds', () => {
  it('reads blog ids and strips query and fragment', () => {
    expect(extractInternalPostIds('[a](/blog/alpha/?utm=1) [b](/blog/beta#top)')).toEqual([
      'alpha',
      'beta',
    ]);
  });
});

describe('extractFirstParagraph', () => {
  it('skips leading headings', () => {
    expect(extractFirstParagraph('## Heading\n\nThe real intro.')).toBe('The real intro.');
  });
});

describe('normalizeFocusKeyword', () => {
  it('lowercases and collapses whitespace', () => {
    expect(normalizeFocusKeyword('  Best   Keyboard ')).toBe('best keyboard');
  });

  it('returns an empty string for null', () => {
    expect(normalizeFocusKeyword(null)).toBe('');
  });
});

describe('auditPost', () => {
  it('scores a clean post at 100 with no issues', () => {
    const result = auditPost(makeInput());

    expect(result.score).toBe(100);
    expect(result.issues).toEqual([]);
    expect(result.internalLinks).toBe(2);
    expect(result.externalLinks).toBe(0);
    expect(result.wordCount).toBeGreaterThan(900);
  });

  it('subtracts fifteen per error and five per warning', () => {
    const result = auditPost(makeInput({ title: 'Short' }));

    expect(result.issues.map((issue) => issue.code)).toEqual([
      'title-length',
      'keyword-missing-title',
    ]);
    expect(result.score).toBe(80);
  });

  it('flags an H1 in the body as an error', () => {
    const result = auditPost(makeInput({ body: `# Top\n\n${buildBody()}` }));

    expect(result.issues.some((issue) => issue.code === 'h1-in-body')).toBe(true);
    expect(result.score).toBe(85);
  });

  it('warns when there are fewer than two internal links', () => {
    const body = buildBody().replace(
      'Read [monitor guide](/blog/monitor-guide) and [desk guide](/blog/desk-guide).',
      'No links here.',
    );
    const result = auditPost(makeInput({ body }));

    expect(result.issues.some((issue) => issue.code === 'few-internal-links')).toBe(true);
    expect(result.internalLinks).toBe(0);
  });

  it('warns for each missing keyword placement', () => {
    const result = auditPost(
      makeInput({ focusKeyword: 'mechanical switch', coverAlt: 'A budget keyboard on a desk' }),
    );
    const codes = result.issues.map((issue) => issue.code);

    expect(codes).toContain('keyword-missing-title');
    expect(codes).toContain('keyword-missing-description');
    expect(codes).toContain('keyword-missing-intro');
    expect(codes).toContain('keyword-missing-heading');
    expect(codes).toContain('keyword-missing-cover-alt');
  });

  it('adds an info issue when the FAQ section is missing', () => {
    const body = buildBody().replace('## Frequently asked questions', '## Wrapping up');
    const result = auditPost(makeInput({ body }));

    expect(result.issues.some((issue) => issue.code === 'no-faq')).toBe(true);
  });

  it('applies every penalty and floors at the lowest reachable score', () => {
    const result = auditPost(
      makeInput({ title: 'X', description: 'Y', body: '', coverUrl: null, coverAlt: null }),
    );

    const errors = result.issues.filter((issue) => issue.severity === 'error').length;
    const warnings = result.issues.filter((issue) => issue.severity === 'warning').length;
    const infos = result.issues.filter((issue) => issue.severity === 'info').length;

    expect(errors).toBe(3);
    expect(warnings).toBe(9);
    expect(infos).toBe(1);
    expect(result.score).toBe(9);
  });
});

describe('isRefreshCandidate', () => {
  const now = new Date('2025-07-01T00:00:00.000Z');

  it('is true for a published post untouched for over 180 days', () => {
    expect(
      isRefreshCandidate(
        { status: 'published', pubDate: '2024-01-01T00:00:00.000Z', updatedDate: null },
        now,
      ),
    ).toBe(true);
  });

  it('is false when the latest date is recent', () => {
    expect(
      isRefreshCandidate(
        {
          status: 'published',
          pubDate: '2024-01-01T00:00:00.000Z',
          updatedDate: '2025-06-20T00:00:00.000Z',
        },
        now,
      ),
    ).toBe(false);
  });

  it('is false for a draft', () => {
    expect(
      isRefreshCandidate(
        { status: 'draft', pubDate: '2024-01-01T00:00:00.000Z', updatedDate: null },
        now,
      ),
    ).toBe(false);
  });
});

describe('findCannibalization', () => {
  it('groups published posts sharing a normalized keyword', () => {
    const result = findCannibalization([
      { id: 'a', title: 'A', status: 'published', focusKeyword: 'Best Keyboard' },
      { id: 'b', title: 'B', status: 'published', focusKeyword: 'best keyboard' },
      { id: 'c', title: 'C', status: 'draft', focusKeyword: 'best keyboard' },
      { id: 'd', title: 'D', status: 'published', focusKeyword: 'mouse' },
      { id: 'e', title: 'E', status: 'published', focusKeyword: null },
    ]);

    expect(result).toEqual([
      {
        keyword: 'best keyboard',
        posts: [
          { id: 'a', title: 'A' },
          { id: 'b', title: 'B' },
        ],
      },
    ]);
  });
});

describe('findOrphanPosts', () => {
  it('returns published posts nothing else links to, ignoring self links', () => {
    const result = findOrphanPosts([
      { id: 'a', title: 'A', status: 'published', body: '[x](/blog/b)' },
      { id: 'b', title: 'B', status: 'published', body: 'no links' },
      { id: 'c', title: 'C', status: 'published', body: '[x](/blog/c)' },
      { id: 'd', title: 'D', status: 'draft', body: '' },
    ]);

    expect(result).toEqual([
      { id: 'a', title: 'A' },
      { id: 'c', title: 'C' },
    ]);
  });
});
