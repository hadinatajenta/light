export interface RelatedPost {
  id: string;
  title: string;
}

export function scoreRelated(
  current: { tags: string[]; category: string | null },
  candidate: { tags: string[]; category: string | null },
): number {
  const candidateTags = new Set(candidate.tags);
  const sharedTags = current.tags.filter((tag) => candidateTags.has(tag)).length;
  const sameCategory = current.category !== null && current.category === candidate.category ? 1 : 0;
  return sharedTags * 2 + sameCategory;
}

function resolveCurrentProfile<T extends { id: string; tags: string[]; category: string | null }>(
  current: { id: string },
  candidates: T[],
): { tags: string[]; category: string | null } {
  const declared = current as { tags?: unknown; category?: unknown };

  if (Array.isArray(declared.tags)) {
    return {
      tags: declared.tags.filter((tag): tag is string => typeof tag === 'string'),
      category: typeof declared.category === 'string' ? declared.category : null,
    };
  }

  const match = candidates.find((candidate) => candidate.id === current.id);
  return match ? { tags: match.tags, category: match.category } : { tags: [], category: null };
}

export function selectRelatedPosts<
  T extends { id: string; title: string; tags: string[]; category: string | null },
>(current: { id: string }, candidates: T[], limit: number): T[] {
  const profile = resolveCurrentProfile(current, candidates);

  return candidates
    .filter((candidate) => candidate.id !== current.id)
    .map((candidate) => ({ candidate, score: scoreRelated(profile, candidate) }))
    .filter((entry) => entry.score > 0)
    .sort(
      (first, second) =>
        second.score - first.score || first.candidate.title.localeCompare(second.candidate.title),
    )
    .slice(0, limit)
    .map((entry) => entry.candidate);
}

export async function getRelatedPosts(
  current: { id: string; tags: string[]; category: string | null },
  limit = 4,
): Promise<RelatedPost[]> {
  const { getPublishedPostSummaries } = await import('./public');
  const summaries = await getPublishedPostSummaries();
  return selectRelatedPosts(current, summaries, limit).map(({ id, title }) => ({ id, title }));
}
