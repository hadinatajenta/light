import { toIsoDate } from './date';

export interface TaggedPost {
  tags: string[];
}

export function toLastModified(value: string | null | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : toIsoDate(date);
}

export function collectTagPaths(posts: TaggedPost[], minimumPosts = 2): string[] {
  const tagCounts = new Map<string, number>();

  for (const post of posts) {
    for (const tag of post.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }

  return [...tagCounts.entries()]
    .filter(([, count]) => count >= minimumPosts)
    .map(([tag]) => `/tag/${tag}/`)
    .sort((first, second) => first.localeCompare(second));
}

export function collectPaginationPaths(totalPosts: number, perPage: number): string[] {
  if (perPage <= 0) {
    return [];
  }

  const totalPages = Math.ceil(totalPosts / perPage);

  return Array.from({ length: Math.max(0, totalPages - 1) }, (_, index) => {
    return `/blog/page/${index + 2}/`;
  });
}
