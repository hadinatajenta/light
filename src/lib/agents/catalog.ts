import type { TopicRecord } from './topics';

export interface CatalogCandidate {
  slug: string;
  name: string;
  topics: string | null;
}

const MATCH_STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'at',
  'best',
  'by',
  'for',
  'from',
  'guide',
  'how',
  'in',
  'is',
  'it',
  'of',
  'on',
  'or',
  'that',
  'the',
  'this',
  'to',
  'vs',
  'with',
  'you',
  'your',
]);

const NAME_MATCH_WEIGHT = 2;
const CATEGORY_MATCH_WEIGHT = 5;

export function tokenizeForMatching(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2 && !MATCH_STOPWORDS.has(token));
}

export function parseProductTopics(value: string | null): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((entry): entry is string => typeof entry === 'string');
  } catch {
    return [];
  }
}

export function scoreCatalogCandidate(
  candidate: CatalogCandidate,
  topicTokens: Set<string>,
  category: string | null,
): number {
  const nameTokens = new Set(tokenizeForMatching(candidate.name));
  let score = 0;

  for (const token of nameTokens) {
    if (topicTokens.has(token)) {
      score += NAME_MATCH_WEIGHT;
    }
  }

  if (category && parseProductTopics(candidate.topics).includes(category)) {
    score += CATEGORY_MATCH_WEIGHT;
  }

  return score;
}

export function rankCatalogForTopic<T extends CatalogCandidate>(
  candidates: T[],
  topic: Pick<TopicRecord, 'title' | 'keywords' | 'category'>,
  limit: number,
): T[] {
  const topicTokens = new Set(
    tokenizeForMatching([topic.title, topic.category ?? '', ...topic.keywords].join(' ')),
  );

  return [...candidates]
    .map((candidate) => ({
      candidate,
      score: scoreCatalogCandidate(candidate, topicTokens, topic.category),
    }))
    .sort(
      (first, second) =>
        second.score - first.score || first.candidate.name.localeCompare(second.candidate.name),
    )
    .slice(0, Math.max(limit, 0))
    .map((entry) => entry.candidate);
}
