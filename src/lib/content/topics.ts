import type { SitePostSummary } from './public';

export const TOPIC_LIMIT = 12;

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
  ergonomics: 'Ergonomics',
  'home-office': 'Home Office',
};

export interface TopicLink {
  slug: string;
  label: string;
  count: number;
}

function toTopicLabel(slug: string): string {
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

function rankTopics(counts: Map<string, number>): TopicLink[] {
  return [...counts.entries()]
    .map(([slug, count]) => ({ slug, label: toTopicLabel(slug), count }))
    .sort((first, second) => second.count - first.count || first.label.localeCompare(second.label))
    .slice(0, TOPIC_LIMIT);
}

export async function loadTopics(db: D1Database): Promise<TopicLink[]> {
  const result = await db
    .prepare("SELECT category, tags FROM posts WHERE status = 'published'")
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
