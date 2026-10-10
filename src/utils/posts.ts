interface DatedPost {
  data: { pubDate: Date };
}

interface DraftablePost {
  data: { draft: boolean };
}

interface TaggedPost {
  data: { tags: string[] };
}

export function sortPostsByDateDesc<T extends DatedPost>(posts: T[]): T[] {
  return [...posts].sort(
    (first, second) => second.data.pubDate.valueOf() - first.data.pubDate.valueOf(),
  );
}

export function filterPublishedPosts<T extends DraftablePost>(
  posts: T[],
  includeDrafts: boolean,
): T[] {
  if (includeDrafts) {
    return [...posts];
  }

  return posts.filter((post) => post.data.draft !== true);
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
