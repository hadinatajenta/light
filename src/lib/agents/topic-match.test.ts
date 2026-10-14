import { describe, expect, it } from 'vitest';
import {
  findTopicMatchIssues,
  TITLE_COVERAGE_MIN,
  TOPIC_COVERAGE_MIN,
  TOPIC_MATCH_MIN_TOKENS,
  type TopicMatchIssue,
  type TopicMatchReference,
  tokenizeMatchTerms,
} from './topic-match';

const CROSSED_TITLE = 'Desk Height and Keyboard Position for Long Sessions';
const CROSSED_BODY = [
  '## Taming echo with acoustic panels',
  '',
  'Acoustic panels and bass traps are the fastest way to treat flutter echo in a home studio.',
  'Broadband panels absorb reflections, while bass traps tame the low end in corners where the',
  'room builds up energy. A walk through the room claps will show you where the treatment',
  'belongs before you spend money on a single panel.',
].join('\n');

const STANDING_TITLE = 'Standing desk for a small apartment';
const STANDING_BODY = [
  '## Why a standing desk fits a small apartment',
  '',
  'A compact standing desk gives a small apartment a usable workspace without giving up the',
  'living room. A height adjustable desk lets you sit for long mornings and stand for calls,',
  'and a slim frame keeps the footprint tight against the wall in a compact room.',
].join('\n');

function codes(issues: TopicMatchIssue[]): string[] {
  return issues.map((issue) => issue.code);
}

describe('tokenizeMatchTerms', () => {
  it('lowercases, drops stop words, and removes diacritics', () => {
    expect(tokenizeMatchTerms('Chaises Ergonomiques à Hauteur Réglable and Monitor Arms')).toEqual([
      'chaises',
      'ergonomiques',
      'hauteur',
      'reglable',
      'monitor',
      'arms',
    ]);
  });

  it('keeps first-seen order and removes duplicates', () => {
    expect(tokenizeMatchTerms('Desk desk DESK and monitor Monitor')).toEqual(['desk', 'monitor']);
  });

  it('returns an empty array for blank or non-string input', () => {
    expect(tokenizeMatchTerms('')).toEqual([]);
    expect(tokenizeMatchTerms('   ')).toEqual([]);
    expect(tokenizeMatchTerms('the of and')).toEqual([]);
    expect(tokenizeMatchTerms(undefined as unknown as string)).toEqual([]);
    expect(tokenizeMatchTerms(42 as unknown as string)).toEqual([]);
  });
});

describe('findTopicMatchIssues', () => {
  it('flags an article whose body is about a different subject than its title', () => {
    const reference: TopicMatchReference = {
      title: 'Desk height and keyboard position',
      keywords: ['ergonomic desk', 'monitor riser'],
    };

    const issues = findTopicMatchIssues({ title: CROSSED_TITLE, body: CROSSED_BODY }, reference);

    expect(codes(issues)).toEqual(['TITLE_BODY_MISMATCH']);
    expect(issues[0].score).toBe(0);
    expect(issues[0].message).toContain('Desk Height and Keyboard Position for Long Sessions');
    expect(issues[0].message).toContain('0 of the 6 significant title terms');
    expect(issues[0].message).toContain('0% coverage');
  });

  it('accepts an article whose title and body describe the same subject', () => {
    const reference: TopicMatchReference = {
      title: 'Standing desk for small rooms',
      keywords: ['height adjustable desk', 'compact workspace'],
    };

    expect(findTopicMatchIssues({ title: STANDING_TITLE, body: STANDING_BODY }, reference)).toEqual(
      [],
    );
  });

  it('flags an article that never mentions the assigned topic', () => {
    const reference: TopicMatchReference = {
      title: 'Acoustic panels for home studios',
      keywords: ['bass traps', 'soundproofing foam'],
    };

    const issues = findTopicMatchIssues(
      {
        title: 'Choosing a Monitor Stand',
        body: 'A monitor stand raises the screen to eye level and keeps the desk surface clear.',
      },
      reference,
    );

    expect(codes(issues)).toEqual(['TOPIC_BODY_MISMATCH']);
    expect(issues[0].score).toBe(0);
    expect(issues[0].message).toContain('Acoustic panels for home studios');
    expect(issues[0].message).toContain('0 of the 8 significant topic terms');
  });

  it('reports the title mismatch before the topic mismatch', () => {
    const issues = findTopicMatchIssues(
      { title: CROSSED_TITLE, body: CROSSED_BODY },
      { title: 'Espresso machine for beginners', keywords: ['grinder burrs'] },
    );

    expect(codes(issues)).toEqual(['TITLE_BODY_MISMATCH', 'TOPIC_BODY_MISMATCH']);
    expect(issues.map((issue) => issue.score)).toEqual([0, 0]);
  });

  it('rounds the reported coverage to two decimals', () => {
    const issues = findTopicMatchIssues(
      {
        title: 'Monitor Stand Riser for a Small Office Desk Setup',
        body: 'A monitor stand raises the screen to eye level and clears the desk surface.',
      },
      { title: 'Monitor stand riser', keywords: [] },
    );

    expect(codes(issues)).toEqual(['TITLE_BODY_MISMATCH']);
    expect(issues[0].score).toBe(0.43);
    expect(issues[0].message).toContain('3 of the 7 significant title terms');
  });

  it('stays silent about the title when the title has fewer significant terms than the minimum', () => {
    const issues = findTopicMatchIssues(
      { title: 'Desk', body: 'Bass traps treat echo in a home studio.' },
      { title: 'Acoustic panels', keywords: ['bass traps', 'soundproofing foam'] },
    );

    expect(codes(issues)).toEqual(['TOPIC_BODY_MISMATCH']);
    expect(issues[0].score).toBe(0.33);
  });

  it('stays silent when the reference has fewer significant terms than the minimum', () => {
    const reference: TopicMatchReference = { title: '', keywords: [] };

    expect(findTopicMatchIssues({ title: STANDING_TITLE, body: STANDING_BODY }, reference)).toEqual(
      [],
    );
    expect(
      findTopicMatchIssues(
        { title: STANDING_TITLE, body: STANDING_BODY },
        { title: 'Desk', keywords: [] },
      ),
    ).toEqual([]);
  });

  it('returns no issues for a blank title or a blank body', () => {
    const reference: TopicMatchReference = {
      title: 'Standing desk for small rooms',
      keywords: ['height adjustable desk'],
    };

    expect(findTopicMatchIssues({ title: '', body: STANDING_BODY }, reference)).toEqual([]);
    expect(findTopicMatchIssues({ title: '   ', body: STANDING_BODY }, reference)).toEqual([]);
    expect(findTopicMatchIssues({ title: STANDING_TITLE, body: '' }, reference)).toEqual([]);
    expect(findTopicMatchIssues({ title: STANDING_TITLE, body: '   ' }, reference)).toEqual([]);
  });

  it('does not throw on malformed drafts or references', () => {
    const malformedReference = { title: null, keywords: null } as unknown as TopicMatchReference;

    expect(() =>
      findTopicMatchIssues(
        { title: null, body: null } as unknown as { title: string; body: string },
        malformedReference,
      ),
    ).not.toThrow();
    expect(
      findTopicMatchIssues({ title: STANDING_TITLE, body: STANDING_BODY }, malformedReference),
    ).toEqual([]);
  });

  it('exposes the thresholds used by the guard', () => {
    expect(TOPIC_MATCH_MIN_TOKENS).toBe(2);
    expect(TITLE_COVERAGE_MIN).toBe(0.5);
    expect(TOPIC_COVERAGE_MIN).toBe(0.4);
  });
});
