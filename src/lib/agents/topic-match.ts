export const TOPIC_MATCH_MIN_TOKENS = 2;
export const TITLE_COVERAGE_MIN = 0.5;
export const TOPIC_COVERAGE_MIN = 0.4;

export interface TopicMatchReference {
  title: string;
  keywords: string[];
}

export interface TopicMatchIssue {
  code: 'TITLE_BODY_MISMATCH' | 'TOPIC_BODY_MISMATCH';
  message: string;
  score: number;
}

const STOP_WORDS = new Set([
  'a',
  'about',
  'above',
  'after',
  'again',
  'against',
  'all',
  'also',
  'am',
  'an',
  'and',
  'any',
  'are',
  'article',
  'as',
  'at',
  'be',
  'because',
  'been',
  'before',
  'being',
  'below',
  'best',
  'between',
  'both',
  'but',
  'by',
  'can',
  'cannot',
  'could',
  'did',
  'do',
  'does',
  'doing',
  'done',
  'down',
  'during',
  'each',
  'few',
  'for',
  'from',
  'further',
  'guide',
  'had',
  'has',
  'have',
  'having',
  'he',
  'her',
  'here',
  'hers',
  'herself',
  'him',
  'himself',
  'his',
  'how',
  'i',
  'if',
  'in',
  'into',
  'is',
  'it',
  'its',
  'itself',
  'just',
  'let',
  'like',
  'me',
  'more',
  'most',
  'much',
  'must',
  'my',
  'myself',
  'new',
  'no',
  'not',
  'now',
  'of',
  'off',
  'on',
  'once',
  'only',
  'or',
  'other',
  'ought',
  'our',
  'ours',
  'ourselves',
  'out',
  'over',
  'own',
  'page',
  'per',
  'post',
  'review',
  'same',
  'she',
  'should',
  'so',
  'some',
  'such',
  'than',
  'that',
  'the',
  'their',
  'theirs',
  'them',
  'themselves',
  'then',
  'there',
  'these',
  'they',
  'this',
  'those',
  'through',
  'to',
  'too',
  'top',
  'under',
  'until',
  'up',
  'updated',
  'us',
  'very',
  'versus',
  'vs',
  'was',
  'we',
  'were',
  'what',
  'when',
  'where',
  'which',
  'while',
  'who',
  'whom',
  'why',
  'will',
  'with',
  'would',
  'you',
  'your',
  'yours',
  'yourself',
  'yourselves',
]);

function toComparableText(value: string): string {
  return typeof value === 'string' ? value.trim() : '';
}

function roundCoverage(coverage: number): number {
  return Math.round(coverage * 100) / 100;
}

function formatCoveragePercent(coverage: number): string {
  return `${Math.round(coverage * 100)}%`;
}

function countMatchedTerms(sourceTerms: string[], targetTerms: Set<string>): number {
  let matchedTerms = 0;

  for (const term of sourceTerms) {
    if (targetTerms.has(term)) {
      matchedTerms += 1;
    }
  }

  return matchedTerms;
}

function collectReferenceTerms(reference: TopicMatchReference): string[] {
  const keywords = Array.isArray(reference?.keywords) ? reference.keywords : [];
  const referenceText = [toComparableText(reference?.title), ...keywords].join(' ');

  return tokenizeMatchTerms(referenceText);
}

function describeTopic(reference: TopicMatchReference): string {
  const referenceTitle = toComparableText(reference?.title);

  if (referenceTitle !== '') {
    return referenceTitle;
  }

  const keywords = Array.isArray(reference?.keywords) ? reference.keywords : [];
  const keywordLabel = keywords
    .map((keyword) => toComparableText(keyword))
    .filter((keyword) => keyword !== '');

  return keywordLabel.length > 0 ? keywordLabel.join(', ') : 'the assigned topic';
}

export function tokenizeMatchTerms(value: string): string[] {
  if (typeof value !== 'string' || value.trim() === '') {
    return [];
  }

  const normalizedValue = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  const uniqueTerms: string[] = [];
  const seenTerms = new Set<string>();

  for (const rawToken of normalizedValue.split(/[^a-z0-9]+/)) {
    if (rawToken === '' || STOP_WORDS.has(rawToken) || seenTerms.has(rawToken)) {
      continue;
    }

    seenTerms.add(rawToken);
    uniqueTerms.push(rawToken);
  }

  return uniqueTerms;
}

export function findTopicMatchIssues(
  draft: { title: string; body: string },
  reference: TopicMatchReference,
): TopicMatchIssue[] {
  const draftTitle = toComparableText(draft?.title);
  const draftBody = toComparableText(draft?.body);

  if (draftTitle === '' || draftBody === '') {
    return [];
  }

  const titleTerms = tokenizeMatchTerms(draftTitle);
  const bodyTerms = new Set(tokenizeMatchTerms(draftBody));
  const draftTerms = new Set(tokenizeMatchTerms(`${draftTitle} ${draftBody}`));
  const referenceTerms = collectReferenceTerms(reference);

  const issues: TopicMatchIssue[] = [];

  if (titleTerms.length >= TOPIC_MATCH_MIN_TOKENS) {
    const matchedTitleTerms = countMatchedTerms(titleTerms, bodyTerms);
    const titleCoverage = roundCoverage(matchedTitleTerms / titleTerms.length);

    if (titleCoverage < TITLE_COVERAGE_MIN) {
      issues.push({
        code: 'TITLE_BODY_MISMATCH',
        message: `Title "${draftTitle}" is not supported by the article body: the body contains ${matchedTitleTerms} of the ${titleTerms.length} significant title terms (${formatCoveragePercent(titleCoverage)} coverage, at least ${formatCoveragePercent(TITLE_COVERAGE_MIN)} required).`,
        score: titleCoverage,
      });
    }
  }

  if (referenceTerms.length >= TOPIC_MATCH_MIN_TOKENS) {
    const matchedReferenceTerms = countMatchedTerms(referenceTerms, draftTerms);
    const topicCoverage = roundCoverage(matchedReferenceTerms / referenceTerms.length);

    if (topicCoverage < TOPIC_COVERAGE_MIN) {
      issues.push({
        code: 'TOPIC_BODY_MISMATCH',
        message: `Article does not cover the assigned topic "${describeTopic(reference)}": the draft contains ${matchedReferenceTerms} of the ${referenceTerms.length} significant topic terms (${formatCoveragePercent(topicCoverage)} coverage, at least ${formatCoveragePercent(TOPIC_COVERAGE_MIN)} required).`,
        score: topicCoverage,
      });
    }
  }

  return issues;
}
