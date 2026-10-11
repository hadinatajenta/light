import { z } from 'astro/zod';
import { recordActivity, toUserActor } from '@/lib/activity/record';
import { withAdmin } from '@/lib/api/handler';
import { postFrontmatterSchema } from '@/lib/content/post-schema';
import { createPost, listPosts, type PostSummary } from '@/lib/content/store';
import { jsonOk, readJsonBody } from '@/lib/http';
import { isScheduled } from '@/lib/scheduling/store';

export const prerender = false;

const savePostRequestSchema = z.object({
  slug: z.string().min(1).max(80),
  body: z.string().max(200_000),
  frontmatter: postFrontmatterSchema,
  expectedSha: z.string().optional(),
});

const SORT_OPTIONS = [
  'updated_desc',
  'updated_asc',
  'published_desc',
  'title_asc',
  'title_desc',
] as const;

const DEFAULT_SORT = 'updated_desc';
const DEFAULT_PER_PAGE = 20;
const MAX_PER_PAGE = 50;
const REVIEW_FILTER_OPTIONS = ['all', 'pending', 'approved', 'changes_requested', 'none'] as const;

type PostSort = (typeof SORT_OPTIONS)[number];

function resolveSort(value: string | null): PostSort {
  return value && (SORT_OPTIONS as readonly string[]).includes(value)
    ? (value as PostSort)
    : DEFAULT_SORT;
}

function sortPosts(posts: PostSummary[], sort: PostSort): PostSummary[] {
  const sorted = [...posts];

  if (sort === 'title_asc' || sort === 'title_desc') {
    const direction = sort === 'title_asc' ? 1 : -1;
    return sorted.sort((first, second) => direction * first.title.localeCompare(second.title));
  }

  if (sort === 'published_desc') {
    return sorted.sort((first, second) =>
      (second.pubDate ?? '').localeCompare(first.pubDate ?? ''),
    );
  }

  const direction = sort === 'updated_asc' ? 1 : -1;
  return sorted.sort((first, second) => {
    const firstDate = first.updatedDate ?? first.pubDate ?? '';
    const secondDate = second.updatedDate ?? second.pubDate ?? '';
    return direction * firstDate.localeCompare(secondDate);
  });
}

function matchesReview(post: PostSummary, review: string): boolean {
  const status = post.reviewStatus ?? null;

  if (review === 'none') {
    return status === null;
  }

  return status === review;
}

export const GET = withAdmin(async ({ url }, requestId) => {
  const status = url.searchParams.get('status') ?? 'all';
  const category = url.searchParams.get('category');
  const query = (url.searchParams.get('q') ?? '').trim().toLowerCase();
  const reviewParam = url.searchParams.get('review') ?? 'all';
  const review = (REVIEW_FILTER_OPTIONS as readonly string[]).includes(reviewParam)
    ? reviewParam
    : 'all';
  const sort = resolveSort(url.searchParams.get('sort'));
  const page = Math.max(1, Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
  const requestedPerPage = Number.parseInt(
    url.searchParams.get('per_page') ?? String(DEFAULT_PER_PAGE),
    10,
  );
  const perPage =
    requestedPerPage >= 10 && requestedPerPage <= MAX_PER_PAGE
      ? requestedPerPage
      : DEFAULT_PER_PAGE;

  const allPosts = sortPosts(await listPosts(), sort);
  const now = new Date();

  const filtered = allPosts.filter((post) => {
    if (status === 'scheduled') {
      if (!isScheduled(post.status, post.pubDate, now)) {
        return false;
      }
    } else if (status !== 'all' && post.status !== status) {
      return false;
    }
    if (category && post.category !== category) {
      return false;
    }
    if (review !== 'all' && !matchesReview(post, review)) {
      return false;
    }
    if (query && !post.title.toLowerCase().includes(query) && !post.id.includes(query)) {
      return false;
    }
    return true;
  });

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * perPage;

  return jsonOk(
    {
      posts: filtered.slice(startIndex, startIndex + perPage),
      total,
      page: currentPage,
      per_page: perPage,
      total_pages: totalPages,
    },
    requestId,
  );
});

export const POST = withAdmin(async ({ request }, requestId, user) => {
  const payload = savePostRequestSchema.parse(await readJsonBody(request, 300_000));

  const post = await createPost({
    slug: payload.slug,
    data: {
      ...payload.frontmatter,
      slug: payload.slug,
      pubDate: payload.frontmatter.pubDate,
      updatedDate: new Date(),
    },
    body: payload.body,
    message: `feat(content): add ${payload.slug}`,
  });

  await recordActivity({
    ...toUserActor(user),
    action: 'post.created',
    targetType: 'post',
    targetId: post.id,
    summary: `Created post "${payload.frontmatter.title}"`,
  });

  return jsonOk({ id: post.id, sha: post.sha, status: payload.frontmatter.status }, requestId, 201);
});
