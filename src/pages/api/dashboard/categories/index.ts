import { withAdmin } from '@/lib/api/handler';
import { categorySchema, readCategories, writeCategories } from '@/lib/content/category-store';
import { getGithubConfig } from '@/lib/content/config';
import { listPosts } from '@/lib/content/post-store';
import { ApiError, jsonOk, readJsonBody } from '@/lib/http';

export const prerender = false;

export const GET = withAdmin(async (_context, requestId) => {
  const config = getGithubConfig();
  const { categories } = await readCategories(config);
  const posts = await listPosts(config);

  const withCounts = categories.map((category) => ({
    ...category,
    postCount: posts.filter((post) => post.category === category.slug).length,
  }));

  return jsonOk({ categories: withCounts }, requestId);
});

export const POST = withAdmin(async ({ request }, requestId) => {
  const config = getGithubConfig();
  const payload = categorySchema.parse(await readJsonBody(request, 10_000));
  const { categories, sha } = await readCategories(config);

  if (categories.some((category) => category.slug === payload.slug)) {
    throw new ApiError(409, 'CATEGORY_EXISTS', 'A category with that slug already exists.');
  }

  await writeCategories(
    config,
    [...categories, payload],
    sha,
    `feat(content): add category ${payload.slug}`,
  );

  return jsonOk({ category: payload }, requestId, 201);
});
