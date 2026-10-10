import { withAdmin } from '@/lib/api/handler';
import { categorySchema, readCategories, writeCategories } from '@/lib/content/category-store';
import { getGithubConfig } from '@/lib/content/config';
import { listPosts } from '@/lib/content/post-store';
import { ApiError, jsonOk, readJsonBody } from '@/lib/http';

export const prerender = false;

function requireSlug(slug: string | undefined): string {
  if (!slug) {
    throw new ApiError(400, 'MISSING_SLUG', 'The category slug is required.');
  }
  return slug;
}

export const PUT = withAdmin(async ({ params, request }, requestId) => {
  const config = getGithubConfig();
  const slug = requireSlug(params.slug);
  const payload = categorySchema.parse(await readJsonBody(request, 10_000));
  const { categories, sha } = await readCategories(config);

  const index = categories.findIndex((category) => category.slug === slug);
  if (index === -1) {
    throw new ApiError(404, 'CATEGORY_NOT_FOUND', 'That category does not exist.');
  }

  const next = [...categories];
  next[index] = payload;

  await writeCategories(config, next, sha, `feat(content): update category ${slug}`);

  return jsonOk({ category: payload }, requestId);
});

export const DELETE = withAdmin(async ({ params }, requestId) => {
  const config = getGithubConfig();
  const slug = requireSlug(params.slug);
  const { categories, sha } = await readCategories(config);

  if (!categories.some((category) => category.slug === slug)) {
    throw new ApiError(404, 'CATEGORY_NOT_FOUND', 'That category does not exist.');
  }

  const posts = await listPosts(config);
  const inUse = posts.filter((post) => post.category === slug).length;

  if (inUse > 0) {
    throw new ApiError(409, 'CATEGORY_IN_USE', `Reassign the ${inUse} post(s) first.`);
  }

  await writeCategories(
    config,
    categories.filter((category) => category.slug !== slug),
    sha,
    `chore(content): remove category ${slug}`,
  );

  return jsonOk({ slug, deleted: true }, requestId);
});
