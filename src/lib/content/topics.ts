import type { SitePostSummary } from './public';
import { TOPIC_CONTENT, type TopicContent } from './topic-content';

export type { TopicContent } from './topic-content';

export const TOPIC_LIMIT = 12;
export const MIN_TOPIC_POSTS = 2;
export const MIN_INDEXABLE_TOPIC_POSTS = 3;

export const INDEXABLE_TOPIC_SLUGS: readonly string[] = [
  'monitors',
  'chairs',
  'standing-desks',
  'keyboards',
  'audio',
  'desk-setup',
  'laptops',
  'tablets',
  'accessories',
  'lighting',
];

export interface PillarPostSplit {
  pillarPosts: SitePostSummary[];
  otherPosts: SitePostSummary[];
}

export const PILLAR_SLUGS_BY_TOPIC: Readonly<Record<string, readonly string[]>> = {
  monitors: ['how-to-choose-a-monitor-for-a-home-office', 'how-to-choose-a-monitor-arm'],
  chairs: ['office-chair-features-worth-paying-for'],
  'standing-desks': ['how-to-choose-a-standing-desk-for-a-small-home-office'],
  'desk-setup': [
    'how-to-plan-a-desk-setup-you-will-not-outgrow',
    'cable-management-for-a-small-desk',
  ],
  laptops: ['m6-macbook-pro-vs-m5-pro-proled-which-to-buy'],
  accessories: ['laptop-cooling-when-a-stand-is-enough'],
};

export interface TopicLink {
  slug: string;
  label: string;
  count: number;
}

const TOPIC_LABELS: Record<string, string> = {
  monitors: 'Monitors',
  keyboards: 'Keyboards',
  audio: 'Audio',
  'desk-setup': 'Desk Setup',
  chairs: 'Chairs',
  laptops: 'Laptops',
  lighting: 'Lighting',
  storage: 'Storage',
  'buying-basics': 'Buying Basics',
  accessories: 'Accessories',
  'standing-desks': 'Standing Desks',
  tablets: 'Tablets',
  phones: 'Phones',
  'ai-software': 'AI & Software',
  'data-storage': 'Data Storage',
  networking: 'Networking',
  printers: 'Printers & Scanners',
  'meeting-gear': 'Meeting Gear',
  ergonomics: 'Ergonomics',
  'home-office': 'Home Office',
};

export const TOPIC_SLUGS: readonly string[] = Object.keys(TOPIC_LABELS);

export function topicLabel(slug: string): string {
  const known = TOPIC_LABELS[slug];
  if (known) {
    return known;
  }

  return slug
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function topicContent(slug: string): TopicContent {
  const known = TOPIC_CONTENT[slug];
  if (known) {
    return known;
  }

  const label = topicLabel(slug);

  return {
    title: `${label} guides from Light Scripts`,
    description: `Independent buying guides about ${label.toLowerCase()}: what to check, what to avoid, and the measurements that decide it.`,
    intro: `Every guide filed under ${label.toLowerCase()}, written from primary sources and reviewed before publishing.`,
  };
}

function pickPostsBySlug(slugs: readonly string[], posts: SitePostSummary[]): SitePostSummary[] {
  const postsById = new Map(posts.map((post) => [post.id, post]));

  return slugs.flatMap((slug) => {
    const post = postsById.get(slug);
    return post ? [post] : [];
  });
}

export function splitPillarPosts(slug: string, posts: SitePostSummary[]): PillarPostSplit {
  const pillarPosts = pickPostsBySlug(PILLAR_SLUGS_BY_TOPIC[slug] ?? [], posts);
  const pillarIds = new Set(pillarPosts.map((post) => post.id));

  return {
    pillarPosts,
    otherPosts: posts.filter((post) => !pillarIds.has(post.id)),
  };
}

export function listPillarPosts(posts: SitePostSummary[]): SitePostSummary[] {
  const pillarSlugs = [...new Set(Object.values(PILLAR_SLUGS_BY_TOPIC).flat())];
  return pickPostsBySlug(pillarSlugs, posts);
}

export function listTopicPosts(posts: SitePostSummary[], slug: string): SitePostSummary[] {
  return posts.filter((post) => post.tags.includes(slug) || post.category === slug);
}

export interface IndexableTopic extends TopicLink {
  lastModified: string | undefined;
}

export function isIndexableTopic(slug: string, postCount: number): boolean {
  return INDEXABLE_TOPIC_SLUGS.includes(slug) && postCount >= MIN_INDEXABLE_TOPIC_POSTS;
}

function findNewestPostDate(posts: SitePostSummary[]): string | undefined {
  let newestDate: string | undefined;
  let newestTime = Number.NEGATIVE_INFINITY;

  for (const post of posts) {
    const candidateDate = post.updatedDate ?? post.pubDate;
    const candidateTime = candidateDate ? new Date(candidateDate).getTime() : Number.NaN;

    if (candidateDate && !Number.isNaN(candidateTime) && candidateTime > newestTime) {
      newestDate = candidateDate;
      newestTime = candidateTime;
    }
  }

  return newestDate;
}

export function listIndexableTopics(posts: SitePostSummary[]): IndexableTopic[] {
  return INDEXABLE_TOPIC_SLUGS.map((slug) => ({ slug, topicPosts: listTopicPosts(posts, slug) }))
    .filter(({ slug, topicPosts }) => isIndexableTopic(slug, topicPosts.length))
    .map(({ slug, topicPosts }) => ({
      slug,
      label: topicLabel(slug),
      count: topicPosts.length,
      lastModified: findNewestPostDate(topicPosts),
    }));
}

function rankTopics(counts: Map<string, number>): TopicLink[] {
  return [...counts.entries()]
    .filter(([, count]) => count >= MIN_TOPIC_POSTS)
    .map(([slug, count]) => ({ slug, label: topicLabel(slug), count }))
    .sort((first, second) => second.count - first.count || first.label.localeCompare(second.label))
    .slice(0, TOPIC_LIMIT);
}

export function buildTopics(posts: SitePostSummary[]): TopicLink[] {
  const counts = new Map<string, number>();

  for (const post of posts) {
    const slugs = post.category ? [...post.tags, post.category] : post.tags;

    for (const slug of slugs) {
      counts.set(slug, (counts.get(slug) ?? 0) + 1);
    }
  }

  return rankTopics(counts);
}

export async function loadTopics(db: D1Database): Promise<TopicLink[]> {
  const result = await db
    .prepare("SELECT category, tags FROM posts WHERE status = 'published' AND noindex = 0")
    .all<{ category: string | null; tags: string }>();
  const counts = new Map<string, number>();

  for (const row of result.results ?? []) {
    const slugs = [...readRowTags(row.tags), ...(row.category ? [row.category] : [])];

    for (const slug of slugs) {
      counts.set(slug, (counts.get(slug) ?? 0) + 1);
    }
  }

  return rankTopics(counts);
}

function readRowTags(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === 'string')
      : [];
  } catch {
    return [];
  }
}
