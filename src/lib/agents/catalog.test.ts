import { describe, expect, it } from 'vitest';
import {
  type CatalogCandidate,
  parseProductTopics,
  rankCatalogForTopic,
  tokenizeForMatching,
} from './catalog';

const MONITOR_ARM: CatalogCandidate = {
  slug: 'mountup-dual-monitor-arm',
  name: 'MOUNTUP Dual Monitor Desk Mount',
  topics: null,
};

const OFFICE_CHAIR: CatalogCandidate = {
  slug: 'ergonomic-office-chair',
  name: 'Ergonomic Mesh Office Chair',
  topics: null,
};

const WEBCAM: CatalogCandidate = {
  slug: 'hd-webcam',
  name: 'HD Webcam with Microphone',
  topics: '["webcam"]',
};

function topic(title: string, keywords: string[], category: string | null) {
  return { title, keywords, category };
}

describe('tokenizeForMatching', () => {
  it('lowercases, splits on punctuation, and drops stopwords', () => {
    expect(tokenizeForMatching('The Best Guide to Monitor Arms')).toEqual(['monitor', 'arms']);
  });

  it('keeps short product words that are not stopwords', () => {
    expect(tokenizeForMatching('Desk and Chair')).toEqual(['desk', 'chair']);
  });
});

describe('parseProductTopics', () => {
  it('parses a json array of strings', () => {
    expect(parseProductTopics('["webcam","audio"]')).toEqual(['webcam', 'audio']);
  });

  it('returns an empty array for malformed or non-array values', () => {
    expect(parseProductTopics('not json')).toEqual([]);
    expect(parseProductTopics('{"a":1}')).toEqual([]);
    expect(parseProductTopics(null)).toEqual([]);
  });
});

describe('rankCatalogForTopic', () => {
  it('puts name matched products ahead of unrelated ones', () => {
    const ranked = rankCatalogForTopic(
      [OFFICE_CHAIR, MONITOR_ARM, WEBCAM],
      topic('Best monitor arm for a small desk', [], null),
      3,
    );

    expect(ranked.map((item) => item.slug)).toEqual([
      'mountup-dual-monitor-arm',
      'ergonomic-office-chair',
      'hd-webcam',
    ]);
  });

  it('weighs a category match above a name match', () => {
    const ranked = rankCatalogForTopic(
      [MONITOR_ARM, WEBCAM],
      topic('Choosing a camera for calls', ['camera'], 'webcam'),
      2,
    );

    expect(ranked[0]?.slug).toBe('hd-webcam');
  });

  it('respects the limit', () => {
    const candidates = Array.from({ length: 30 }, (_, index) => ({
      slug: `product-${index}`,
      name: `Monitor Arm ${index}`,
      topics: null,
    }));

    expect(rankCatalogForTopic(candidates, topic('Monitor arms', [], null), 12)).toHaveLength(12);
  });

  it('falls back to a deterministic alphabetical order when nothing matches', () => {
    const ranked = rankCatalogForTopic(
      [WEBCAM, OFFICE_CHAIR, MONITOR_ARM],
      topic('Noise cancelling headphones', [], null),
      2,
    );

    expect(ranked.map((item) => item.slug)).toEqual(['ergonomic-office-chair', 'hd-webcam']);
  });

  it('does not mutate the input list', () => {
    const candidates = [OFFICE_CHAIR, MONITOR_ARM];
    const snapshot = candidates.map((item) => item.slug);

    rankCatalogForTopic(candidates, topic('Monitor arm', [], null), 2);

    expect(candidates.map((item) => item.slug)).toEqual(snapshot);
  });

  it('returns an empty list for a non positive limit', () => {
    expect(rankCatalogForTopic([MONITOR_ARM], topic('Monitor arm', [], null), 0)).toEqual([]);
  });
});
