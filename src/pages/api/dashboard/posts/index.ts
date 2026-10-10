import { z } from 'astro/zod';
import { withAdmin } from '@/lib/api/handler';
import { postFrontmatterSchema } from '@/lib/content/post-schema';
import { createPost, listPosts, type PostSummary } from '@/lib/content/store';
import { jsonOk, readJsonBody } from '@/lib/http';

export const prerender = false;

const savePostRequestSchema = z.object({
  slug: z.string().min(1).max(80),
  body: z.string().max(200_000),
  frontmatter: postFrontmatterSchema,
  expectedSha: z.string().optional(),
});

function sortPosts(posts: PostSummary[]): PostSummary[] {
  return [...posts].sort((first, second) => {
    const firstDate = first.updatedDate ?? first.pubDate ?? '';
    const secondDate = second.updatedDate ?? second.pubDate ?? '';
    return secondDate.localeCompare(firstDate);
  });
}

export const GET = withAdmin(async ({ url }, requestId) => {
  const status = url.searchParams.get('status') ?? 'all';
  const category = url.searchParams.get('category');
  const query = (url.searchParams.get('q') ?? '').trim().toLowerCase();
  const page = Math.max(1, Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
  const perPage = Math.min(
    50,
    Math.max(1, Number.parseInt(url.searchParams.get('per_page') ?? '20', 10) || 20),
  );

  const allPosts = sortPosts(await listPosts());

  const filtered = allPosts.filter((post) => {
    if (status !== 'all' && post.status !== status) {
      return false;
    }
    if (category && post.category !== category) {
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

export const POST = withAdmin(async ({ request }, requestId) => {
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

  return jsonOk({ id: post.id, sha: post.sha, status: payload.frontmatter.status }, requestId, 201);
});
