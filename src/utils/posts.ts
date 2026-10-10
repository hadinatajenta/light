import type { PostStatus } from '@/lib/content/post-schema';

interface DatedPost {
  data: { pubDate: Date };
}

interface StatusPost {
  data: { status: PostStatus };
}

interface TaggedPost {
  data: { tags: string[] };
}

export function sortPostsByDateDesc<T extends DatedPost>(posts: T[]): T[] {
  return [...posts].sort(
    (first, second) => second.data.pubDate.valueOf() - first.data.pubDate.valueOf(),
  );
}

export function filterVisiblePosts<T extends StatusPost>(posts: T[], includeDrafts: boolean): T[] {
  return posts.filter((post) => {
    if (post.data.status === 'published') {
      return true;
    }

    if (post.data.status === 'draft') {
      return includeDrafts;
    }

    return false;
  });
}

export function collectTags<T extends TaggedPost>(posts: T[]): string[] {
  const uniqueTags = new Set<string>();

  for (const post of posts) {
    for (const tag of post.data.tags) {
      uniqueTags.add(tag);
    }
  }

  return [...uniqueTags].sort((first, second) => first.localeCompare(second));
}
