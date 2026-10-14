import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { findTopicMatchIssues } from '../src/lib/agents/topic-match';

const DATABASE_NAME = 'light-content';
const BODY_EXCERPT_LENGTH = 200;
const UNLINKED_TOPIC_TITLE = 'NO LINKED TOPIC';
const UNKNOWN_VALUE = 'unknown';

const PUBLISHED_POSTS_SQL = `SELECT
  posts.id AS post_id,
  posts.title AS post_title,
  posts.description AS post_description,
  posts.review_status AS post_review_status,
  posts.body AS post_body,
  posts.published_at AS post_published_at,
  posts.updated_at AS post_updated_at,
  topics.title AS topic_title,
  topics.keywords AS topic_keywords,
  topics.category AS topic_category
FROM posts
LEFT JOIN topics ON topics.used_post_id = posts.id
WHERE posts.status = 'published'
ORDER BY posts.published_at, posts.id, topics.created_at`;

interface PublishedPostRow {
  post_id: string;
  post_title: string;
  post_description: string;
  post_review_status: string | null;
  post_body: string;
  post_published_at: string | null;
  post_updated_at: string | null;
  topic_title: string | null;
  topic_keywords: string | null;
  topic_category: string | null;
}

interface PostReference {
  slug: string;
  title: string;
  description: string;
  reviewStatus: string;
  publishedAt: string;
  updatedAt: string;
  topicTitle: string;
  topicCategory: string;
  isLinkedTopic: boolean;
  keywords: string[];
  body: string;
}

interface FlaggedPost {
  slug: string;
  title: string;
  description: string;
  topicTitle: string;
  topicCategory: string;
  isLinkedTopic: boolean;
  reviewStatus: string;
  publishedAt: string;
  updatedAt: string;
  bodyExcerpt: string;
  issueLines: string[];
}

function queryRows<T>(command: string): T[] {
  const output = execFileSync(
    'npx',
    ['wrangler', 'd1', 'execute', DATABASE_NAME, '--remote', '--json', '--command', command],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
  );

  const parsed = JSON.parse(output) as Array<{ results?: T[] }>;
  return parsed[0]?.results ?? [];
}

function parseKeywords(value: string | null): string[] {
  try {
    const parsed = JSON.parse(value ?? '[]');
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === 'string')
      : [];
  } catch {
    return [];
  }
}

function buildReference(row: PublishedPostRow): PostReference {
  const linkedTopicTitle = typeof row.topic_title === 'string' ? row.topic_title.trim() : '';
  const isLinkedTopic = linkedTopicTitle.length > 0;

  return {
    slug: row.post_id,
    title: row.post_title,
    description: row.post_description,
    reviewStatus: row.post_review_status ?? UNKNOWN_VALUE,
    publishedAt: row.post_published_at ?? UNKNOWN_VALUE,
    updatedAt: row.post_updated_at ?? UNKNOWN_VALUE,
    topicTitle: isLinkedTopic ? linkedTopicTitle : row.post_title,
    topicCategory: row.topic_category ?? UNKNOWN_VALUE,
    isLinkedTopic,
    keywords: isLinkedTopic ? parseKeywords(row.topic_keywords) : [],
    body: row.post_body,
  };
}

function collectReferences(rows: PublishedPostRow[]): PostReference[] {
  const referencesBySlug = new Map<string, PostReference>();

  for (const row of rows) {
    const reference = buildReference(row);
    const existing = referencesBySlug.get(reference.slug);

    if (!existing || (!existing.isLinkedTopic && reference.isLinkedTopic)) {
      referencesBySlug.set(reference.slug, reference);
    }
  }

  return [...referencesBySlug.values()];
}

function auditReferences(references: PostReference[]): FlaggedPost[] {
  const flagged: FlaggedPost[] = [];

  for (const reference of references) {
    const issues = findTopicMatchIssues(
      { title: reference.title, body: reference.body },
      { title: reference.topicTitle, keywords: reference.keywords },
    );

    if (issues.length === 0) {
      continue;
    }

    flagged.push({
      slug: reference.slug,
      title: reference.title,
      description: reference.description,
      topicTitle: reference.topicTitle,
      topicCategory: reference.topicCategory,
      isLinkedTopic: reference.isLinkedTopic,
      reviewStatus: reference.reviewStatus,
      publishedAt: reference.publishedAt,
      updatedAt: reference.updatedAt,
      bodyExcerpt: reference.body.replace(/\s+/g, ' ').slice(0, BODY_EXCERPT_LENGTH),
      issueLines: issues.map((issue) => `${issue.code}: ${issue.message}`),
    });
  }

  return flagged;
}

function formatFlaggedPost(flaggedPost: FlaggedPost, position: number, total: number): string[] {
  return [
    `[${position}/${total}] ${flaggedPost.slug}`,
    `  title: ${flaggedPost.title}`,
    `  description: ${flaggedPost.description}`,
    `  linked topic: ${flaggedPost.isLinkedTopic ? flaggedPost.topicTitle : UNLINKED_TOPIC_TITLE}`,
    `  linked topic category: ${flaggedPost.topicCategory}`,
    `  review status: ${flaggedPost.reviewStatus}`,
    `  published at: ${flaggedPost.publishedAt}`,
    `  updated at: ${flaggedPost.updatedAt}`,
    '  issues:',
    ...flaggedPost.issueLines.map((issueLine) => `    - ${issueLine}`),
    `  body excerpt: ${flaggedPost.bodyExcerpt}`,
    '',
  ];
}

function printReport(totalPublished: number, flagged: FlaggedPost[]): void {
  console.log(`Topic match audit for ${DATABASE_NAME} (published posts only).`);
  console.log(`Published posts scanned: ${totalPublished}`);
  console.log(`Flagged posts: ${flagged.length}`);

  if (flagged.length === 0) {
    console.log('No topic match issues found.');
    return;
  }

  console.log('');

  flagged.forEach((flaggedPost, index) => {
    for (const line of formatFlaggedPost(flaggedPost, index + 1, flagged.length)) {
      console.log(line);
    }
  });
}

function auditPublishedPosts(): number {
  const references = collectReferences(queryRows<PublishedPostRow>(PUBLISHED_POSTS_SQL));
  const flagged = auditReferences(references);

  printReport(references.length, flagged);
  return flagged.length;
}

try {
  process.exitCode = auditPublishedPosts() > 0 ? 1 : 0;
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
